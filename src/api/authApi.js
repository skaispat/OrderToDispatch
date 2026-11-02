import { supabase } from './client';

const SESSION_KEY = 'skai_auth_session';

// Never keep the password in the browser session
const toSession = (userRecord) => {
  const { password: _password, ...safeUser } = userRecord;
  return {
    ...safeUser,
    name: safeUser.full_name || safeUser.username,
  };
};

export const authApi = {
  // Login directly against users table: username / mobile_number & password
  async login(identifier, password) {
    const cleanId = (identifier || '').trim();
    const cleanPassword = (password || '').trim();

    if (!cleanId || !cleanPassword) {
      throw new Error('Please enter your username and password.');
    }

    // 1. Query by username (case-insensitive)
    let { data: userRecord, error } = await supabase
      .from('users')
      .select('*')
      .ilike('username', cleanId)
      .maybeSingle();

    if (error) {
      console.error('Supabase users query error:', error);
      throw new Error(error.message || 'Database connection error.');
    }

    // 2. Fallback to check by mobile_number if not found by username
    if (!userRecord) {
      const { data: mobileRecord, error: mobileErr } = await supabase
        .from('users')
        .select('*')
        .eq('mobile_number', cleanId)
        .maybeSingle();

      if (mobileErr) {
        throw new Error(mobileErr.message || 'Database connection error.');
      }

      userRecord = mobileRecord;
    }

    // Account existence check
    if (!userRecord) {
      throw new Error('No user account found with this username or mobile number.');
    }

    // Account active / inactive status check
    const status = (userRecord.status || '').trim().toLowerCase();
    if (status !== 'active') {
      throw new Error(
        `Your account status is "${userRecord.status || 'inactive'}". Access is disabled. Please contact the administrator to activate your account.`
      );
    }

    // Password verification
    if (userRecord.password !== cleanPassword) {
      throw new Error('Incorrect password. Please try again.');
    }

    const session = toSession(userRecord);

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  },

  // Verify if a session account is still active in the database
  async verifyUserActive(empId) {
    if (!empId) return null;
    const { data: userRecord, error } = await supabase
      .from('users')
      .select('*')
      .eq('emp_id', empId)
      .maybeSingle();

    if (error || !userRecord) return null;

    const status = (userRecord.status || '').trim().toLowerCase();
    if (status !== 'active') {
      return null;
    }

    const session = toSession(userRecord);
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  },

  async logout() {
    localStorage.removeItem(SESSION_KEY);
    return true;
  },

  getCurrentUser() {
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  },
};
