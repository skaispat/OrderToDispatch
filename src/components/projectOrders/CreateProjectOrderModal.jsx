import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { projectOrdersApi, SARTHAK_PROJECT_TAG } from '../../api/projectOrdersApi';
import { dispatchApi, lotDispatchKey, lotDispatchTotals } from '../../api/dispatchApi';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import {
  Building,
  Plus,
  Trash2,
  Calendar,
  FileText,
  User,
  Layers,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  RotateCcw,
  MapPin,
} from 'lucide-react';
import {
  TMT_SIZES,
  JSW_ONE_PRODUCTS,
  ONE_HELIX_PRODUCTS,
  ESSAR_PRODUCTS,
} from '../../data/constants';

// GSTIN: 2-digit state code, 10-char PAN, entity code, 'Z', check character
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const ADDRESS_MAX_LENGTH = 500;
const CONSIGNEE_NAME_MAX_LENGTH = 200;
const SHORT_TEXT_MAX_LENGTH = 100; // lot no, grade, section
const DEFAULT_GST_PERCENT = '18';

// Bar sizes offered in a lot's Section dropdown
const SECTION_OPTIONS = ['8mm', '10mm', '12mm', '16mm', '20mm', '25mm', '28mm', '32mm'];

// One section (bar size) of a lot: carries the qty and pricing
const emptySection = () => ({
  section: '',
  qty: '',
  rate: '',
  gstPercent: DEFAULT_GST_PERCENT,
});

// Delivery lot of a consignee: lot no, grade, schedule and its sections (lots are the order's line items)
const emptyLot = () => ({
  lotNo: '',
  grade: '',
  sections: [emptySection()],
  startDate: '',
  endDate: '',
});

// GST % is pre-filled, so it does not make a section / lot "filled" on its own
const isBlankSection = (sec) =>
  !String(sec.section).trim() && String(sec.qty).trim() === '' && String(sec.rate).trim() === '';

const isBlankLot = (lot) =>
  !lot.lotNo.trim() &&
  !lot.grade.trim() &&
  lot.sections.every(isBlankSection) &&
  !lot.startDate &&
  !lot.endDate;

const filledSectionsOf = (lot) => lot.sections.filter((sec) => !isBlankSection(sec));

// Section value: qty x price, GST on top
const getSectionAmounts = (sec) => {
  const qty = parseFloat(sec.qty) || 0;
  const rate = parseFloat(sec.rate) || 0;
  const gstPercent = parseFloat(sec.gstPercent) || 0;
  const taxable = qty * rate;
  const gstAmount = (taxable * gstPercent) / 100;
  return { qty, rate, gstPercent, taxable, gstAmount, total: taxable + gstAmount };
};

// Lot value: total of its sections; rate is the average price per MT, GST % only when all sections share it
const getLotAmounts = (lot) => {
  const parts = filledSectionsOf(lot).map(getSectionAmounts);
  const sum = (k) => parts.reduce((acc, p) => acc + p[k], 0);
  const qty = sum('qty');
  const taxable = sum('taxable');
  const gstAmount = sum('gstAmount');
  const gstRates = [...new Set(parts.map((p) => p.gstPercent))];
  return {
    qty,
    rate: qty > 0 ? taxable / qty : 0,
    gstPercent: gstRates.length === 1 ? gstRates[0] : null,
    taxable,
    gstAmount,
    total: taxable + gstAmount,
  };
};

// Consignee (ship-to) record; the buyer (bill-to) is entered once for the whole order
const emptyDeliveryRow = () => ({
  consigneeName: '',
  shippingAddress: '',
  shippingGst: '',
  lots: [emptyLot()],
});

const isBlankDeliveryRow = (row) =>
  !row.consigneeName.trim() &&
  !row.shippingAddress.trim() &&
  !row.shippingGst.trim() &&
  row.lots.every(isBlankLot);

const getRowQty = (row) => row.lots.reduce((acc, lot) => acc + getLotAmounts(lot).qty, 0);

const round2 = (n) => Number((Number.isFinite(n) ? n : 0).toFixed(2));

const toInputValue = (v) => (v === null || v === undefined ? '' : String(v));

// Form rows from a saved order's consignees (order.deliveries with lotsList).
// _key keeps the delivery_details key so dispatches stay linked to their consignee / lot.
const deliveryRowsFromOrder = (order) => {
  const deliveries = Array.isArray(order?.deliveries) ? order.deliveries : [];
  const rows = deliveries.map((d) => {
    const gstOf = (v) => (v === null || v === undefined || v === '' ? DEFAULT_GST_PERCENT : String(v));
    const lots = (Array.isArray(d.lotsList) ? d.lotsList : []).map((l) => {
      // Lots saved before sections existed become a single section
      const savedSections = Array.isArray(l.sections) && l.sections.length
        ? l.sections.map((sec) => ({
          section: toInputValue(sec.section),
          qty: toInputValue(sec.qty),
          rate: toInputValue(sec.price),
          gstPercent: gstOf(sec.gst_percent),
        }))
        : [{
          section: toInputValue(l.section || d.section),
          qty: toInputValue(l.qty),
          rate: toInputValue(l.price),
          gstPercent: gstOf(l.gst_percent),
        }];
      return {
        _key: l.key ? String(l.key) : undefined,
        lotNo: toInputValue(l.lot_no),
        grade: toInputValue(l.grade || d.grade),
        sections: savedSections,
        startDate: toInputValue(l.start_date),
        endDate: toInputValue(l.end_date),
      };
    });
    return {
      _key: d.key ? String(d.key) : undefined,
      consigneeName: toInputValue(d.consignee_name),
      shippingAddress: toInputValue(d.shipping_address),
      shippingGst: toInputValue(d.shipping_gst),
      lots: lots.length ? lots : [emptyLot()],
    };
  });
  return rows.length ? rows : [emptyDeliveryRow()];
};

// Next free numbered key, never reusing a key the saved order had (its dispatches may point at it)
const nextKey = (usedKeys) => String(Math.max(0, ...[...usedKeys].map((k) => parseInt(k, 10) || 0)) + 1);

// sarthakProject: Sarthak TMT project order (Project Manager / Super Admin) -> order id OR/<FY>/SAR-P/<n>, brand_type 'Sarthak'
// headerSlot: optional content shown at the top of the form (e.g. Standard / Project order switch)
// editOrder: an existing project order (as loaded by projectOrdersApi.getProjectOrders) to edit instead of creating one
export const CreateProjectOrderModal = ({
  isOpen,
  onClose,
  onOrderCreated,
  defaultFirmId,
  sarthakProject = false,
  headerSlot = null,
  editOrder = null,
}) => {
  const isEdit = Boolean(editOrder);
  const { firmAccess, canEdit, isProjectManager, isSuperAdmin } = useAuth();
  // Firm the order is booked under: the firm selected on screen, otherwise the user's own firm
  const orderFirmId = defaultFirmId || firmAccess?.firmId || null;
  const { showToast, triggerRefresh } = useApp();

  const todayStr = new Date().toISOString().slice(0, 10);

  // Determine if logged in manager is under JSW Firm (firm_id 2 or name contains JSW)
  const isJSWFirm =
    !sarthakProject && Number(orderFirmId) === 2;

  // Determine if logged in manager is under ESSAR Firm (firm_id 6 or 3, or name contains ESSAR)
  const isEssarFirm =
    !sarthakProject && [3, 6].includes(Number(orderFirmId));

  // Firm name shown in the form (all-firms users book under the firm selected on screen)
  const firmDisplayName = sarthakProject ? 'Sarthak TMT' : isJSWFirm ? 'JSW One' : isEssarFirm ? 'ESSAR' : 'Sarthak TMT';
  const orderTag = sarthakProject ? SARTHAK_PROJECT_TAG : null;

  // Whether the firm uses a single unified dropdown with full ISI specification
  const hasUnifiedDropdown = isJSWFirm || isEssarFirm;

  // Hide Party / Client field for firm 2 and firm 6 (JSW and ESSAR)
  const hidePartyField =
    [2, 6].includes(Number(orderFirmId)) ||
    isEssarFirm ||
    isJSWFirm;

  // Party-based orders take their products, qty and pricing from the consignee lots
  // (no separate Item & Description section); JSW / ESSAR keep the product line items
  const useLotPricing = !hidePartyField;

  // Modal Step: for JSW, start with 'select_brand', then go to 'form'. For Essar & others, go directly to 'form'
  const [modalStep, setModalStep] = useState(isJSWFirm ? 'select_brand' : 'form');
  const [selectedSubtype, setSelectedSubtype] = useState('JSW One'); // 'JSW One' | 'One Helix'

  const [orderDate, setOrderDate] = useState(todayStr);
  const [partyName, setPartyName] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [previewOrderId, setPreviewOrderId] = useState('');
  const [loading, setLoading] = useState(false);
  // Buyer (once) and consignee records for delivery_details jsonb (shown once a party name is entered)
  const [buyerAddress, setBuyerAddress] = useState('');
  const [buyerGstNo, setBuyerGstNo] = useState('');
  const [deliveryRows, setDeliveryRows] = useState([emptyDeliveryRow()]);
  // Saved party names (project_party_details) offered in the Party / Client field
  const [partyOptions, setPartyOptions] = useState([]);
  const showDeliveryDetails = !hidePartyField && partyName.trim() !== '';

  const getSubtypeProducts = (subtype = selectedSubtype) => {
    if (isEssarFirm) return ESSAR_PRODUCTS;
    return subtype === 'One Helix' ? ONE_HELIX_PRODUCTS : JSW_ONE_PRODUCTS;
  };

  // Line items for product_details jsonb
  const [items, setItems] = useState([
    {
      productName: isJSWFirm
        ? JSW_ONE_PRODUCTS[2]
        : isEssarFirm
          ? ESSAR_PRODUCTS[2]
          : 'Fe 550D TMT Rebar',
      size: '12mm',
      qty: '',
      rate: '',
    },
  ]);

  // Reset form whenever modal opens
  useEffect(() => {
    if (isOpen && editOrder) {
      // Edit: fill the form from the saved order
      const subtype = editOrder.product_details?.subtype;
      setModalStep('form');
      setSelectedSubtype(subtype === 'One Helix' ? 'One Helix' : 'JSW One');
      setOrderDate(String(editOrder.date || editOrder.created_at || todayStr).slice(0, 10));
      setPartyName(editOrder.party_name || '');
      setPoNumber(editOrder.po_number && editOrder.po_number !== '—' ? editOrder.po_number : '');
      const buyer = (editOrder.deliveries || []).find((d) => d.billing_address || d.billing_address_gst_no);
      setBuyerAddress(buyer?.billing_address || '');
      setBuyerGstNo(buyer?.billing_address_gst_no || '');
      setDeliveryRows(deliveryRowsFromOrder(editOrder));
      const savedItems = Array.isArray(editOrder.items) ? editOrder.items : [];
      setItems(
        savedItems.length
          ? savedItems.map((it) => ({
            productName: it.productName || 'TMT Rebar',
            size: it.size || '12mm',
            qty: toInputValue(it.qty),
            rate: toInputValue(it.rate),
          }))
          : [{ productName: 'Fe 550D TMT Rebar', size: '12mm', qty: '', rate: '' }]
      );
      setPreviewOrderId(editOrder.order_id || '');
      return;
    }
    if (isOpen) {
      setModalStep(isJSWFirm ? 'select_brand' : 'form');
      setSelectedSubtype('JSW One');
      setOrderDate(todayStr);
      setPartyName('');
      setPoNumber('');
      setBuyerAddress('');
      setBuyerGstNo('');
      setDeliveryRows([emptyDeliveryRow()]);
      const initialProducts = isJSWFirm
        ? JSW_ONE_PRODUCTS
        : isEssarFirm
          ? ESSAR_PRODUCTS
          : null;
      setItems([
        {
          productName: initialProducts ? initialProducts[2] : 'Fe 550D TMT Rebar',
          size: '12mm',
          qty: '',
          rate: '',
        },
      ]);
    }
  }, [isOpen, isJSWFirm, isEssarFirm, todayStr, editOrder]);

  // Load saved party names each time the form opens (a failed load leaves the field as plain text input)
  useEffect(() => {
    if (!isOpen || hidePartyField) return;
    let isSubscribed = true;
    projectOrdersApi
      .getPartyNames()
      .then((names) => {
        if (isSubscribed) setPartyOptions(names);
      })
      .catch((err) => console.warn('Could not load saved party names:', err));
    return () => {
      isSubscribed = false;
    };
  }, [isOpen, hidePartyField]);

  // Update preview order ID whenever orderDate or firm_id changes (with subscription tracking to prevent race conditions)
  useEffect(() => {
    let isSubscribed = true;
    // An edited order keeps its own order ID
    if (isOpen && orderDate && !isEdit) {
      projectOrdersApi
        .generateNextOrderId(orderDate, orderFirmId, orderTag)
        .then((id) => {
          if (isSubscribed && id) {
            setPreviewOrderId(id);
          }
        })
        .catch(() => { });
    }
    return () => {
      isSubscribed = false;
    };
  }, [isOpen, orderDate, orderFirmId, orderTag, isEdit]);

  const handleSelectSubtype = (subtype) => {
    setSelectedSubtype(subtype);
    const newProducts = getSubtypeProducts(subtype);
    // Map existing line items to matching sizes in new subtype
    setItems((prev) =>
      prev.map((it) => {
        const matchingProd =
          newProducts.find((p) => p.endsWith(it.size)) || newProducts[0];
        const match = matchingProd.match(/(\d+mm)$/i);
        return {
          ...it,
          productName: matchingProd,
          size: match ? match[1] : it.size || '12mm',
        };
      })
    );
    setModalStep('form');
  };

  const handleAddItem = () => {
    if (hasUnifiedDropdown) {
      const prods = getSubtypeProducts(selectedSubtype);
      const usedNames = new Set(items.map((it) => it.productName));
      const nextProd = prods.find((p) => !usedNames.has(p)) || prods[0];
      const match = nextProd.match(/(\d+mm)$/i);
      setItems((prev) => [
        ...prev,
        {
          productName: nextProd,
          size: match ? match[1] : '12mm',
          qty: '',
          rate: prev[prev.length - 1]?.rate || '',
        },
      ]);
    } else {
      setItems((prev) => [
        ...prev,
        {
          productName: 'Fe 550D TMT Rebar',
          size: '16mm',
          qty: '',
          rate: prev[prev.length - 1]?.rate || '',
        },
      ]);
    }
  };

  const handleRemoveItem = (index) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index, field, value) => {
    setItems((prev) =>
      prev.map((it, idx) => (idx === index ? { ...it, [field]: value } : it))
    );
  };

  const handleJswProductChange = (index, fullProductName) => {
    const match = fullProductName.match(/(\d+mm)$/i);
    const extractedSize = match ? match[1] : '12mm';
    setItems((prev) =>
      prev.map((it, idx) =>
        idx === index
          ? {
            ...it,
            productName: fullProductName,
            size: extractedSize,
          }
          : it
      )
    );
  };

  const handleAddDeliveryRow = () => {
    setDeliveryRows((prev) => [...prev, emptyDeliveryRow()]);
  };

  const handleRemoveDeliveryRow = (index) => {
    if (deliveryRows.length <= 1) return;
    setDeliveryRows((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleDeliveryChange = (index, field, value) => {
    setDeliveryRows((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, [field]: value } : row))
    );
  };

  const handleAddLot = (rowIndex) => {
    setDeliveryRows((prev) =>
      prev.map((row, idx) => (idx === rowIndex ? { ...row, lots: [...row.lots, emptyLot()] } : row))
    );
  };

  const handleRemoveLot = (rowIndex, lotIndex) => {
    setDeliveryRows((prev) =>
      prev.map((row, idx) =>
        idx === rowIndex && row.lots.length > 1
          ? { ...row, lots: row.lots.filter((_, li) => li !== lotIndex) }
          : row
      )
    );
  };

  const handleLotChange = (rowIndex, lotIndex, field, value) => {
    setDeliveryRows((prev) =>
      prev.map((row, idx) =>
        idx === rowIndex
          ? { ...row, lots: row.lots.map((lot, li) => (li === lotIndex ? { ...lot, [field]: value } : lot)) }
          : row
      )
    );
  };

  const updateLotSections = (rowIndex, lotIndex, fn) => {
    setDeliveryRows((prev) =>
      prev.map((row, idx) =>
        idx === rowIndex
          ? {
            ...row,
            lots: row.lots.map((lot, li) => (li === lotIndex ? { ...lot, sections: fn(lot.sections) } : lot)),
          }
          : row
      )
    );
  };

  const handleAddSection = (rowIndex, lotIndex) =>
    updateLotSections(rowIndex, lotIndex, (secs) => [...secs, emptySection()]);

  const handleRemoveSection = (rowIndex, lotIndex, secIndex) =>
    updateLotSections(rowIndex, lotIndex, (secs) => (secs.length > 1 ? secs.filter((_, si) => si !== secIndex) : secs));

  const handleSectionChange = (rowIndex, lotIndex, secIndex, field, value) =>
    updateLotSections(rowIndex, lotIndex, (secs) =>
      secs.map((sec, si) => (si === secIndex ? { ...sec, [field]: value } : sec))
    );

  // Lots of every consignee (only rows with data) — the order's line items for party-based orders
  const filledLotsOf = (row) => row.lots.filter((lot) => !isBlankLot(lot));
  const allLots = deliveryRows.flatMap(filledLotsOf);

  // Calculations: from the lots for party-based orders, from the product line items otherwise
  const totalQty = useLotPricing
    ? allLots.reduce((acc, lot) => acc + getLotAmounts(lot).qty, 0)
    : items.reduce((acc, it) => acc + (parseFloat(it.qty) || 0), 0);
  const totalValue = useLotPricing
    ? allLots.reduce((acc, lot) => acc + getLotAmounts(lot).taxable, 0)
    : items.reduce((acc, it) => acc + (parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0), 0);
  const totalGst = useLotPricing ? allLots.reduce((acc, lot) => acc + getLotAmounts(lot).gstAmount, 0) : 0;
  const grandTotal = totalValue + totalGst;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!canEdit('orders')) {
      alert('Access Denied: You have view-only access to Orders and cannot create project orders.');
      return;
    }
    if (sarthakProject && !isProjectManager && !isSuperAdmin) {
      alert(`Access Denied: Only Project Managers and Super Admins can ${isEdit ? 'edit' : 'book'} Sarthak project orders.`);
      return;
    }

    if (!hidePartyField && !partyName.trim()) {
      alert('Please enter Client / Party Name.');
      return;
    }

    if (!useLotPricing) {
      if (items.length === 0) {
        alert('Please add at least one product item.');
        return;
      }

      const invalidQtyItem = items.find((it) => {
        const q = parseFloat(it.qty);
        return isNaN(q) || q <= 0;
      });
      if (invalidQtyItem) {
        alert('Please enter a valid positive quantity (> 0 MT) for all line items.');
        return;
      }

      const invalidRateItem = items.find((it) => {
        const r = parseFloat(it.rate);
        return !isNaN(r) && r < 0;
      });
      if (invalidRateItem) {
        alert('Rate per MT cannot be negative.');
        return;
      }
    }

    // Buyer & consignee records: fully blank consignee rows are skipped, filled rows must be complete and valid
    const filledDeliveryRows = showDeliveryDetails
      ? deliveryRows.filter((row) => !isBlankDeliveryRow(row))
      : [];
    if (useLotPricing && filledDeliveryRows.length === 0) {
      alert('Please add at least one Consignee record with its lots.');
      return;
    }
    const buyerAddressValue = buyerAddress.trim();
    const buyerGstValue = buyerGstNo.trim();
    if (filledDeliveryRows.length > 0) {
      if (!buyerAddressValue) {
        alert('Please enter the Buyer Address.');
        return;
      }
      if (buyerAddressValue.length > ADDRESS_MAX_LENGTH) {
        alert(`Buyer Address must be ${ADDRESS_MAX_LENGTH} characters or fewer.`);
        return;
      }
      if (buyerGstValue && !GSTIN_REGEX.test(buyerGstValue)) {
        alert('Buyer GST No. is not a valid 15-character GSTIN.');
        return;
      }
    }
    for (let i = 0; i < filledDeliveryRows.length; i++) {
      const row = filledDeliveryRows[i];
      const label = `Consignee record ${i + 1}`;
      if (!row.shippingAddress.trim()) {
        alert(`${label}: please enter the Consignee Address.`);
        return;
      }
      if (row.consigneeName.trim().length > CONSIGNEE_NAME_MAX_LENGTH) {
        alert(`${label}: Consignee Name must be ${CONSIGNEE_NAME_MAX_LENGTH} characters or fewer.`);
        return;
      }
      if (row.shippingAddress.trim().length > ADDRESS_MAX_LENGTH) {
        alert(`${label}: address must be ${ADDRESS_MAX_LENGTH} characters or fewer.`);
        return;
      }
      if (row.shippingGst.trim() && !GSTIN_REGEX.test(row.shippingGst.trim())) {
        alert(`${label}: Consignee GST No. is not a valid 15-character GSTIN.`);
        return;
      }
      const filledLots = filledLotsOf(row);
      if (filledLots.length === 0) {
        alert(`${label}: please add at least one lot with its quantity.`);
        return;
      }
      for (let j = 0; j < filledLots.length; j++) {
        const lot = filledLots[j];
        const lotLabel = `${label}, lot ${j + 1}`;
        if ([lot.lotNo, lot.grade].some((v) => v.trim().length > SHORT_TEXT_MAX_LENGTH)) {
          alert(`${lotLabel}: Lot No and Grade must be ${SHORT_TEXT_MAX_LENGTH} characters or fewer.`);
          return;
        }
        const filledSections = filledSectionsOf(lot);
        if (filledSections.length === 0) {
          alert(`${lotLabel}: please add at least one section with its quantity.`);
          return;
        }
        for (let k = 0; k < filledSections.length; k++) {
          const sec = filledSections[k];
          const secLabel = `${lotLabel}, section ${k + 1}`;
          if (!String(sec.section).trim()) {
            alert(`${secLabel}: please select the section.`);
            return;
          }
          const q = parseFloat(sec.qty);
          if (isNaN(q) || q <= 0) {
            alert(`${secLabel}: please enter a valid positive quantity (> 0 MT).`);
            return;
          }
          const r = parseFloat(sec.rate);
          if (String(sec.rate).trim() !== '' && (isNaN(r) || r < 0)) {
            alert(`${secLabel}: Price per MT cannot be negative.`);
            return;
          }
          const g = parseFloat(sec.gstPercent);
          if (String(sec.gstPercent).trim() !== '' && (isNaN(g) || g < 0 || g > 100)) {
            alert(`${secLabel}: GST % must be between 0 and 100.`);
            return;
          }
        }
        // yyyy-mm-dd strings from date inputs compare correctly as text
        if (lot.startDate && lot.endDate && lot.endDate < lot.startDate) {
          alert(`${lotLabel}: End Date cannot be before Start Date.`);
          return;
        }
      }
    }

    if (totalQty <= 0) {
      alert('Total order quantity must be greater than zero.');
      return;
    }

    setLoading(true);
    try {
      // Line items in product_details (read by order lists and dispatch): built from the lots for party-based orders
      const sanitizedItems = useLotPricing
        ? filledDeliveryRows.flatMap((row) =>
          filledLotsOf(row).flatMap((lot) =>
            filledSectionsOf(lot).map((sec) => {
              const a = getSectionAmounts(sec);
              const grade = lot.grade.trim();
              const section = String(sec.section).trim();
              return {
                productName: [grade, section].filter(Boolean).join(' ') || 'TMT Rebar',
                size: section || null,
                grade: grade || null,
                section: section || null,
                lotNo: lot.lotNo.trim() || null,
                consignee: row.consigneeName.trim() || row.shippingAddress.trim(),
                qty: a.qty,
                rate: a.rate,
                total: round2(a.taxable),
                gstPercent: a.gstPercent,
                gstAmount: round2(a.gstAmount),
                totalWithGst: round2(a.total),
              };
            })
          )
        )
        : items.map((it) => {
          const q = parseFloat(it.qty) || 0;
          const r = parseFloat(it.rate) || 0;
          return {
            productName: it.productName || 'TMT Rebar',
            size: it.size || '12mm',
            qty: q,
            rate: r,
            total: q * r,
          };
        });

      // Product Details & Indent Items stored in jsonb (totalValue is before GST)
      const productDetailsPayload = {
        subtype: sarthakProject ? 'Sarthak TMT' : isJSWFirm ? selectedSubtype : isEssarFirm ? 'ESSAR Steel' : null,
        brand: sarthakProject ? 'Sarthak' : isJSWFirm ? selectedSubtype : isEssarFirm ? 'ESSAR' : null,
        specification: null,
        items: sanitizedItems,
        totalQty: round2(totalQty),
        totalValue: round2(totalValue),
        ...(useLotPricing ? { totalGst: round2(totalGst), totalValueWithGst: round2(grandTotal) } : {}),
      };

      // delivery_details jsonb:
      // { "1": { billing_address, billing_address_gst_no, consignee_name, shipping_address, shipping_gst, qty,
      //          lots: { "1": { lot_no, grade, section, qty, price, gst_percent, gst_amount, total_price,
      //                         start_date, end_date,
      //                         sections: [{ section, qty, price, gst_percent, gst_amount, total_price }] }, ... } },
      //   "2": {...} }
      // A lot's section / qty / price / totals summarise its sections (dispatch works per lot)
      // The buyer (billing) entered once is written into every consignee record; qty is the total of its lots
      // Keys: an edited order keeps each consignee's / lot's saved key; new ones get the next unused number
      const savedDeliveries = isEdit && Array.isArray(editOrder.deliveries) ? editOrder.deliveries : [];
      const usedRowKeys = new Set([
        ...savedDeliveries.map((d) => String(d.key)),
        ...filledDeliveryRows.map((r) => r._key).filter(Boolean),
      ]);
      const rowKeys = filledDeliveryRows.map((row) => {
        if (row._key) return row._key;
        const k = nextKey(usedRowKeys);
        usedRowKeys.add(k);
        return k;
      });
      const lotKeysOf = (row, rowKey) => {
        const saved = savedDeliveries.find((d) => String(d.key) === rowKey);
        const used = new Set([
          ...(saved?.lotsList || []).map((l) => String(l.key)),
          ...filledLotsOf(row).map((l) => l._key).filter(Boolean),
        ]);
        return filledLotsOf(row).map((lot) => {
          if (lot._key) return lot._key;
          const k = nextKey(used);
          used.add(k);
          return k;
        });
      };

      const deliveryDetailsPayload = filledDeliveryRows.length
        ? Object.fromEntries(
          filledDeliveryRows.map((row, idx) => [
            rowKeys[idx],
            {
              billing_address: buyerAddressValue,
              billing_address_gst_no: buyerGstValue || null,
              consignee_name: row.consigneeName.trim() || null,
              shipping_address: row.shippingAddress.trim(),
              shipping_gst: row.shippingGst.trim() || null,
              qty: round2(getRowQty(row)),
              lots: Object.fromEntries(
                filledLotsOf(row).map((lot, li) => {
                  const a = getLotAmounts(lot);
                  return [
                    lotKeysOf(row, rowKeys[idx])[li],
                    {
                      lot_no: lot.lotNo.trim() || null,
                      grade: lot.grade.trim() || null,
                      section:
                        [...new Set(filledSectionsOf(lot).map((sec) => String(sec.section).trim()).filter(Boolean))].join(', ') ||
                        null,
                      qty: round2(a.qty),
                      price: round2(a.rate),
                      gst_percent: a.gstPercent,
                      gst_amount: round2(a.gstAmount),
                      total_price: round2(a.total),
                      start_date: lot.startDate || null,
                      end_date: lot.endDate || null,
                      sections: filledSectionsOf(lot).map((sec) => {
                        const sa = getSectionAmounts(sec);
                        return {
                          section: String(sec.section).trim() || null,
                          qty: round2(sa.qty),
                          price: round2(sa.rate),
                          gst_percent: sa.gstPercent,
                          gst_amount: round2(sa.gstAmount),
                          total_price: round2(sa.total),
                        };
                      }),
                    },
                  ];
                })
              ),
            },
          ])
        )
        : null;

      const payload = {
        created_at: new Date(orderDate).toISOString(),
        date: orderDate,
        order_id: previewOrderId || undefined,
        party_name: hidePartyField ? null : partyName.trim() || null,
        po_number: poNumber.trim() || null,
        firm_id: orderFirmId ? parseInt(orderFirmId, 10) : null,
        product_details: productDetailsPayload,
        ...(deliveryDetailsPayload ? { delivery_details: deliveryDetailsPayload } : {}),
        ...(sarthakProject ? { brand_type: 'Sarthak', order_tag: orderTag } : {}),
      };

      if (isEdit) {
        // Quantities already dispatched cannot be removed from the order
        const dispatches = await dispatchApi.getOrderDispatches('project', editOrder.db_id);
        const dispatchedTotal = dispatches.reduce((acc, r) => acc + (Number(r.dispatch_qty) || 0), 0);
        if (totalQty + 0.0005 < dispatchedTotal) {
          throw new Error(
            `${round2(dispatchedTotal)} MT of this order is already dispatched; the total quantity cannot be less than that.`
          );
        }
        const lotTotals = lotDispatchTotals(dispatches);
        const lotNames = new Map();
        dispatches.forEach((r) =>
          (r.project_order_details?.consignees || []).forEach((c) =>
            (c.lots || []).forEach((l) =>
              lotNames.set(lotDispatchKey(c.key, l.key), `${c.consignee_name || `Consignee ${c.key}`} - ${l.lot_no}`)
            )
          )
        );
        for (const [key, dispatched] of lotTotals) {
          if (dispatched <= 0) continue;
          const [ck, lk] = key.split('|');
          const lot = deliveryDetailsPayload?.[ck]?.lots?.[lk];
          const name = lotNames.get(key) || 'A lot';
          if (!lot) {
            throw new Error(`${name} already has ${round2(dispatched)} MT dispatched, so it cannot be removed.`);
          }
          if (lot.qty + 0.0005 < dispatched) {
            throw new Error(`${name}: quantity cannot be less than the ${round2(dispatched)} MT already dispatched.`);
          }
        }

        const updated = await projectOrdersApi.updateProjectOrder(editOrder.db_id, {
          created_at: payload.created_at,
          party_name: payload.party_name,
          po_number: payload.po_number,
          product_details: payload.product_details,
          delivery_details: deliveryDetailsPayload,
        });
        showToast(`Project Order ${editOrder.order_id} updated successfully!`);
        triggerRefresh();
        if (onOrderCreated) onOrderCreated(updated);
        onClose();
        return;
      }

      const result = await projectOrdersApi.createProjectOrder(payload);
      showToast(`Project Order ${result.order_id || previewOrderId} created successfully!`);
      triggerRefresh();
      if (onOrderCreated) onOrderCreated(result);
      onClose();
    } catch (err) {
      console.error(`Error ${isEdit ? 'updating' : 'creating'} project order:`, err);
      alert(`Failed to ${isEdit ? 'update' : 'create'} project order: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Step 1 for JSW: Brand Subtype Selection Popup
  if (isJSWFirm && modalStep === 'select_brand') {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Select JSW Subtype"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200">
            <div className="flex items-center gap-2 mb-1">
              <Building className="w-4 h-4 text-blue-700" />
              <span className="text-xs font-bold text-blue-900">
                {firmDisplayName || 'JSW One'}
              </span>
            </div>
            <p className="text-xs text-blue-800">
              Select the brand subtype to create this project order under:
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {/* JSW One Option */}
            <button
              type="button"
              onClick={() => handleSelectSubtype('JSW One')}
              className="w-full text-left p-4 rounded-xl border-2 border-slate-200 hover:border-blue-600 bg-white hover:bg-blue-50/40 transition group cursor-pointer shadow-xs hover:shadow-md"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
                  <span className="text-sm font-extrabold text-slate-900 group-hover:text-blue-700">
                    JSW One
                  </span>
                </div>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                  Primary Series
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-700 mb-2">
                JSW One TMT ISI 1786 : 2008 Fe 550
              </p>
              <div className="flex flex-wrap gap-1">
                {['8mm', '10mm', '12mm', '16mm', '20mm', '25mm', '32mm'].map((sz) => (
                  <span
                    key={sz}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                  >
                    {sz}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-end text-xs font-bold text-blue-600 group-hover:translate-x-0.5 transition-transform">
                <span>Select & Continue</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </div>
            </button>

            {/* One Helix Option */}
            <button
              type="button"
              onClick={() => handleSelectSubtype('One Helix')}
              className="w-full text-left p-4 rounded-xl border-2 border-slate-200 hover:border-purple-600 bg-white hover:bg-purple-50/40 transition group cursor-pointer shadow-xs hover:shadow-md"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-600 inline-block" />
                  <span className="text-sm font-extrabold text-slate-900 group-hover:text-purple-700">
                    One Helix
                  </span>
                </div>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                  Helix Series
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-700 mb-2">
                One Helix IS TMT 1786:2008 Fe 550
              </p>
              <div className="flex flex-wrap gap-1">
                {['8mm', '10mm', '12mm', '16mm', '20mm', '25mm', '32mm'].map((sz) => (
                  <span
                    key={sz}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                  >
                    {sz}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-end text-xs font-bold text-purple-600 group-hover:translate-x-0.5 transition-transform">
                <span>Select & Continue</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </div>
            </button>
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // Step 2 (or default for non-JSW): Order Creation Form
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        isEdit
          ? `Edit Project Order — ${editOrder.order_id}`
          : sarthakProject
            ? 'Book Order — Sarthak TMT'
            : isJSWFirm
              ? `Book Order — ${selectedSubtype}`
              : isEssarFirm
                ? 'Book Order — ESSAR Steel'
                : 'Book Order'
      }
      maxWidth="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {!isEdit && headerSlot}

        {/* Top Info Banner: Firm Name, Brand Subtype & Order ID */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-3">
            <Building className="w-4 h-4 text-[#a81b1e]" />
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-500 block">Assigned Firm</span>
              <p className="text-xs font-black text-slate-900">
                {firmDisplayName || (isEssarFirm ? 'ESSAR' : 'Assigned Firm')} (ID: #{orderFirmId || '—'})
              </p>
            </div>

            {isJSWFirm && (
              <div className="flex items-center gap-1.5 pl-3 border-l border-slate-200">
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-extrabold ${selectedSubtype === 'One Helix'
                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                    : 'bg-blue-100 text-blue-800 border border-blue-200'
                    }`}
                >
                  {selectedSubtype}
                </span>
                <button
                  type="button"
                  onClick={() => setModalStep('select_brand')}
                  className="text-[10px] font-bold text-slate-500 hover:text-blue-600 underline cursor-pointer ml-1"
                  title="Switch between JSW One and One Helix"
                >
                  Change
                </button>
              </div>
            )}

            {isEssarFirm && (
              <div className="flex items-center gap-1.5 pl-3 border-l border-slate-200">
                <span className="px-2 py-0.5 rounded text-[11px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                  ESSAR Steel
                </span>
              </div>
            )}
          </div>

          {previewOrderId && (
            <div className="flex items-center gap-2">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500 block text-right">Project Order ID</span>
                <span className="font-mono text-xs font-extrabold text-[#a81b1e] bg-red-50 border border-red-200 px-2 py-0.5 rounded inline-block">
                  {previewOrderId}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Basic Information */}
        <div className={`grid grid-cols-1 ${hidePartyField ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-3`}>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              Order Date *
            </label>
            <input
              type="date"
              required
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
            />
          </div>

          {!hidePartyField && (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                Party / Client Name *
              </label>
              <input
                type="text"
                required={!hidePartyField}
                list="project-party-names"
                autoComplete="off"
                placeholder="Select a saved party or type a new one"
                value={partyName}
                onChange={(e) => setPartyName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
              />
              {/* Saved parties from project_party_details; any new name can still be typed */}
              <datalist id="project-party-names">
                {partyOptions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              PO Number
            </label>
            <input
              type="text"
              placeholder="e.g. PO/2026/8942"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
            />
          </div>
        </div>

        {/* Buyer (entered once) & Consignee records (saved in delivery_details jsonb), shown once a party name is entered */}
        {showDeliveryDetails && (
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <label className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#a81b1e]" />
              Buyer & Consignee Details
            </label>

            {/* Buyer: same for every consignee record */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-2.5 rounded-lg border border-slate-200 bg-white">
              <div className="sm:col-span-8">
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">
                  Buyer Address
                </label>
                <input
                  type="text"
                  maxLength={ADDRESS_MAX_LENGTH}
                  placeholder="Buyer / billing address"
                  value={buyerAddress}
                  onChange={(e) => setBuyerAddress(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#a81b1e]"
                />
              </div>
              <div className="sm:col-span-4">
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">
                  Buyer GST No.
                </label>
                <input
                  type="text"
                  maxLength={15}
                  placeholder="e.g. 22AAAAA0000A1Z5"
                  value={buyerGstNo}
                  onChange={(e) => setBuyerGstNo(e.target.value.toUpperCase().replace(/\s/g, ''))}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-[#a81b1e]"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-600 uppercase">Consignees</span>
              <button
                type="button"
                onClick={handleAddDeliveryRow}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold text-[#a81b1e] bg-red-50 hover:bg-red-100 border border-red-200 transition cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                Add Consignee
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {deliveryRows.map((row, idx) => (
                <div key={idx} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Record {idx + 1}</span>
                    {deliveryRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveDeliveryRow(idx)}
                        className="text-slate-400 hover:text-red-600 p-1 rounded transition cursor-pointer"
                        title="Remove record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">
                      Consignee Name <span className="normal-case font-medium text-slate-400">(optional)</span>
                    </label>
                    <input
                      type="text"
                      maxLength={CONSIGNEE_NAME_MAX_LENGTH}
                      placeholder="Consignee / site name"
                      value={row.consigneeName}
                      onChange={(e) => handleDeliveryChange(idx, 'consigneeName', e.target.value)}
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#a81b1e]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-6">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">
                        Consignee Address
                      </label>
                      <input
                        type="text"
                        maxLength={ADDRESS_MAX_LENGTH}
                        placeholder="Consignee / site address"
                        value={row.shippingAddress}
                        onChange={(e) => handleDeliveryChange(idx, 'shippingAddress', e.target.value)}
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#a81b1e]"
                      />
                    </div>
                    <div className="sm:col-span-6">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">
                        Consignee GST No.
                      </label>
                      <input
                        type="text"
                        maxLength={15}
                        placeholder="e.g. 22AAAAA0000A1Z5"
                        value={row.shippingGst}
                        onChange={(e) => handleDeliveryChange(idx, 'shippingGst', e.target.value.toUpperCase().replace(/\s/g, ''))}
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-[#a81b1e]"
                      />
                    </div>
                  </div>

                  {/* Lots: product, qty and pricing of this consignee */}
                  <div className="space-y-1.5 p-2 rounded-md border border-slate-200 bg-white">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-600 uppercase">
                        Qty Lots — Total {getRowQty(row).toFixed(2)} MT
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAddLot(idx)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold text-[#a81b1e] bg-red-50 hover:bg-red-100 border border-red-200 transition cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        Add Lot
                      </button>
                    </div>
                    {row.lots.map((lot, li) => {
                      const lotAmounts = getLotAmounts(lot);
                      const lotInputClass =
                        'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#a81b1e]';
                      const lotLabelClass = 'text-[9px] font-bold text-slate-500 uppercase block mb-0.5';
                      return (
                        <div key={li} className="p-2 rounded-md border border-slate-200 bg-slate-50/60 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Lot {li + 1}</span>
                            {row.lots.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveLot(idx, li)}
                                className="text-slate-400 hover:text-red-600 p-0.5 rounded transition cursor-pointer"
                                title="Remove lot"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Product: lot no, grade */}
                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <label className={lotLabelClass}>Lot No</label>
                              <input
                                type="text"
                                maxLength={SHORT_TEXT_MAX_LENGTH}
                                placeholder={`Lot ${li + 1}`}
                                value={lot.lotNo}
                                onChange={(e) => handleLotChange(idx, li, 'lotNo', e.target.value)}
                                className={lotInputClass}
                              />
                            </div>
                            <div>
                              <label className={lotLabelClass}>Grade</label>
                              <input
                                type="text"
                                maxLength={SHORT_TEXT_MAX_LENGTH}
                                placeholder="e.g. Fe 550D"
                                value={lot.grade}
                                onChange={(e) => handleLotChange(idx, li, 'grade', e.target.value)}
                                className={lotInputClass}
                              />
                            </div>
                          </div>

                          {/* Sections: size, qty, price, GST %, total */}
                          <div className="space-y-1.5 p-1.5 rounded-md border border-slate-200 bg-white">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-bold text-slate-500 uppercase">
                                Sections — {lotAmounts.qty.toFixed(2)} MT · ₹
                                {lotAmounts.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAddSection(idx, li)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold text-[#a81b1e] bg-red-50 hover:bg-red-100 border border-red-200 transition cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                                Add Section
                              </button>
                            </div>
                            {lot.sections.map((sec, si) => {
                              const secAmounts = getSectionAmounts(sec);
                              // Keep an older free-text section selectable when editing
                              const secOptions =
                                sec.section && !SECTION_OPTIONS.includes(sec.section)
                                  ? [sec.section, ...SECTION_OPTIONS]
                                  : SECTION_OPTIONS;
                              return (
                                <div
                                  key={si}
                                  className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_0.8fr_1.2fr_auto] gap-1.5 items-end p-1.5 rounded border border-slate-100 bg-slate-50/60"
                                >
                                  <div className="col-span-2 sm:col-span-1">
                                    <label className={lotLabelClass}>Section</label>
                                    <select
                                      value={sec.section}
                                      onChange={(e) => handleSectionChange(idx, li, si, 'section', e.target.value)}
                                      className={`${lotInputClass} cursor-pointer`}
                                    >
                                      <option value="">Select size</option>
                                      {secOptions.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className={`${lotLabelClass} text-right`}>Qty (MT)</label>
                                    <input
                                      type="number"
                                      step="any"
                                      min="0"
                                      placeholder="MT"
                                      value={sec.qty}
                                      onChange={(e) => handleSectionChange(idx, li, si, 'qty', e.target.value)}
                                      className={`${lotInputClass} text-right`}
                                    />
                                  </div>
                                  <div>
                                    <label className={`${lotLabelClass} text-right`}>Price (₹/MT)</label>
                                    <input
                                      type="number"
                                      step="any"
                                      min="0"
                                      placeholder="₹/MT"
                                      value={sec.rate}
                                      onChange={(e) => handleSectionChange(idx, li, si, 'rate', e.target.value)}
                                      className={`${lotInputClass} text-right`}
                                    />
                                  </div>
                                  <div>
                                    <label className={`${lotLabelClass} text-right`}>GST %</label>
                                    <input
                                      type="number"
                                      step="any"
                                      min="0"
                                      max="100"
                                      placeholder="18"
                                      value={sec.gstPercent}
                                      onChange={(e) => handleSectionChange(idx, li, si, 'gstPercent', e.target.value)}
                                      className={`${lotInputClass} text-right`}
                                    />
                                  </div>
                                  <div>
                                    <label className={`${lotLabelClass} text-right`}>Total Price (₹)</label>
                                    <div
                                      className="w-full rounded-md border border-slate-200 bg-slate-100 px-2 py-1.5 text-xs font-mono font-bold text-slate-900 text-right"
                                      title={`₹${secAmounts.taxable.toLocaleString('en-IN', { maximumFractionDigits: 2 })} + GST ₹${secAmounts.gstAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
                                    >
                                      {secAmounts.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                  </div>
                                  <div className="flex justify-end pb-1">
                                    {lot.sections.length > 1 ? (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveSection(idx, li, si)}
                                        className="text-slate-400 hover:text-red-600 p-0.5 rounded transition cursor-pointer"
                                        title="Remove section"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    ) : (
                                      <span className="w-4" />
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Schedule */}
                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <label className={lotLabelClass}>Start Date</label>
                              <input
                                type="date"
                                value={lot.startDate}
                                onChange={(e) => handleLotChange(idx, li, 'startDate', e.target.value)}
                                className={lotInputClass}
                              />
                            </div>
                            <div>
                              <label className={lotLabelClass}>End Date</label>
                              <input
                                type="date"
                                min={lot.startDate || undefined}
                                value={lot.endDate}
                                onChange={(e) => handleLotChange(idx, li, 'endDate', e.target.value)}
                                className={lotInputClass}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}

        {/* Product line items (JSW / ESSAR only; party-based orders use the consignee lots) */}
        {!useLotPricing && (
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#a81b1e]" />
                {hasUnifiedDropdown
                  ? `Product, ISI & Size (${isJSWFirm ? selectedSubtype : 'ESSAR Steel'})`
                  : 'Item & Description'}
              </label>
              <button
                type="button"
                onClick={handleAddItem}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold text-[#a81b1e] bg-red-50 hover:bg-red-100 border border-red-200 transition cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                Add Product
              </button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {items.map((it, idx) => {
                const lineQty = parseFloat(it.qty) || 0;
                const lineRate = parseFloat(it.rate) || 0;
                const lineTotal = lineQty * lineRate;

                return (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 items-center p-2.5 rounded-lg border border-slate-200 bg-slate-50/70"
                  >
                    {/* For JSW & ESSAR firms: Single unified dropdown containing brand description & size */}
                    {hasUnifiedDropdown ? (
                      <div className="col-span-7 sm:col-span-6">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">
                          Item, ISI Spec & Size
                        </label>
                        <select
                          value={it.productName}
                          onChange={(e) => handleJswProductChange(idx, e.target.value)}
                          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 font-medium focus:outline-none focus:border-[#a81b1e]"
                        >
                          {getSubtypeProducts(selectedSubtype).map((prod) => (
                            <option key={prod} value={prod}>
                              {prod}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <>
                        <div className="col-span-4 sm:col-span-4">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">
                            Product
                          </label>
                          <input
                            type="text"
                            placeholder="Product (e.g. Fe 550D)"
                            value={it.productName}
                            onChange={(e) => handleItemChange(idx, 'productName', e.target.value)}
                            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:outline-none"
                          />
                        </div>

                        <div className="col-span-3 sm:col-span-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">
                            Size
                          </label>
                          <select
                            value={it.size}
                            onChange={(e) => handleItemChange(idx, 'size', e.target.value)}
                            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:outline-none"
                          >
                            {TMT_SIZES.map((sz) => (
                              <option key={sz} value={sz}>
                                {sz}
                              </option>
                            ))}
                            <option value="Custom">Custom</option>
                          </select>
                        </div>
                      </>
                    )}

                    <div className="col-span-2 sm:col-span-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5 text-right">
                        Qty (MT)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="MT"
                        value={it.qty}
                        onChange={(e) => handleItemChange(idx, 'qty', e.target.value)}
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 text-right focus:outline-none focus:border-[#a81b1e]"
                      />
                    </div>

                    <div className="col-span-2 sm:col-span-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5 text-right">
                        Rate (₹)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="₹/MT"
                        value={it.rate}
                        onChange={(e) => handleItemChange(idx, 'rate', e.target.value)}
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 text-right focus:outline-none focus:border-[#a81b1e]"
                      />
                    </div>

                    <div className="col-span-1 sm:col-span-2 flex items-center justify-between pl-1 pt-4">
                      <span className="hidden sm:inline font-mono font-bold text-[11px] text-slate-700">
                        ₹{lineTotal > 0 ? (lineTotal >= 100000 ? `${(lineTotal / 100000).toFixed(2)}L` : lineTotal.toLocaleString('en-IN')) : '0'}
                      </span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-slate-400 hover:text-red-600 p-1 rounded transition cursor-pointer"
                          title="Remove line"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Live Calculation Summary Bar */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-red-50/70 border border-red-200">
          <div>
            <span className="text-[10px] font-bold uppercase text-[#a81b1e] block">Total Order Quantity</span>
            <span className="text-base font-black text-slate-900">
              {totalQty.toFixed(2)} <span className="text-xs font-bold text-slate-500">MT</span>
            </span>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-bold uppercase text-[#a81b1e] block">
              {useLotPricing ? 'Total Order Value (incl. GST)' : 'Total Order Valuation'}
            </span>
            <span className="text-base font-black text-[#a81b1e]">
              ₹ {(useLotPricing ? grandTotal : totalValue).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {useLotPricing && (
              <span className="block text-[10px] font-semibold text-slate-500">
                ₹ {totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} + GST ₹{' '}
                {totalGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 rounded-lg bg-[#a81b1e] text-xs font-bold text-white hover:bg-[#8e1518] transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            {loading ? (
              <span>Saving...</span>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>{isEdit ? 'Update Project Order' : 'Save Project Order'}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
