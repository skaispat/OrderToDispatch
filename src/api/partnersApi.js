import { distributorApi } from './distributorApi';
import { dealerApi } from './dealerApi';

export const partnersApi = {
  async getDistributors(filters = {}) {
    return distributorApi.getDistributors(filters);
  },

  async getDealers(distributorId = null) {
    return dealerApi.getDealers({ distributor_id: distributorId });
  },
};
