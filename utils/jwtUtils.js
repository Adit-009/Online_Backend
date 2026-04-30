const jwt    = require('jsonwebtoken');
const isProd = process.env.NODE_ENV === 'production';

const generateAccessToken = (userId, email) => {
  return jwt.sign(
    { userId, email, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
};

const generateRefreshToken = (userId) => {
  return jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
};

const setAuthCookies = (res, accessToken, refreshToken, req) => {
  // Smarter production detection: 
  // If we are on localhost, we use lax/non-secure for development convenience.
  // If we are on a real domain (like Render), we MUST use none/secure for cross-site cookies.
  const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  const useSecure = isProd || !isLocalhost;
  const sameSite = (isProd || !isLocalhost) ? 'none' : 'lax';

  const cookieOpts = (maxAge) => ({
    httpOnly: true,
    secure: useSecure,
    sameSite: sameSite,
    maxAge,
    path: '/'
  });

  res.cookie('access_token',  accessToken,  cookieOpts(15 * 60 * 1000));
  res.cookie('refresh_token', refreshToken, cookieOpts(7 * 24 * 60 * 60 * 1000));
};

const clearAuthCookies = (res, req) => {
  const isLocalhost = req?.hostname === 'localhost' || req?.hostname === '127.0.0.1';
  const useSecure = isProd || !isLocalhost;
  const sameSite = (isProd || !isLocalhost) ? 'none' : 'lax';
  
  const clearOpts = { path: '/', httpOnly: true, secure: useSecure, sameSite: sameSite };
  res.clearCookie('access_token',  clearOpts);
  res.clearCookie('refresh_token', clearOpts);
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies,
  clearAuthCookies
};
