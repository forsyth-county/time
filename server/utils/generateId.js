const crypto = require("crypto");

const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const ALPHABET_LEN = ALPHANUMERIC.length; // 62

function generateRoomId(length = 8) {
  // Use rejection sampling to avoid modulo bias
  const maxValid = 256 - (256 % ALPHABET_LEN); // 248
  let result = "";
  while (result.length < length) {
    const bytes = crypto.randomBytes(length - result.length);
    for (let i = 0; i < bytes.length && result.length < length; i++) {
      if (bytes[i] < maxValid) {
        result += ALPHANUMERIC[bytes[i] % ALPHABET_LEN];
      }
    }
  }
  return result;
}

function generateShortId(length = 12) {
  return crypto.randomBytes(length).toString("hex").slice(0, length);
}

module.exports = { generateRoomId, generateShortId };
