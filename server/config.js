// Most accounts the app will hold; override with the MAX_USERS environment variable
const MAX_USERS = Number(process.env.MAX_USERS) || 25;

// The admin is the account whose email matches the ADMIN_EMAIL environment variable.
// With ADMIN_EMAIL unset, nobody is an admin.
function isAdminEmail(email) {
  const admin = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  return admin !== '' && typeof email === 'string' && email.trim().toLowerCase() === admin;
}

module.exports = { MAX_USERS, isAdminEmail };
