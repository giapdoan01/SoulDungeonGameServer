// utils/sanitizer.util.js
class SanitizerUtil {
    static sanitizeUsername(username) {
        if (!username || typeof username !== 'string') {
            return 'Guest';
        }
        
        // Remove special characters, keep only alphanumeric and spaces
        const sanitized = username
            .trim()
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .substring(0, 20);
        
        return sanitized || 'Guest';
    }

    static sanitizeNumber(value, defaultValue = 0, min = 0, max = Infinity) {
        const num = parseFloat(value);
        if (isNaN(num)) return defaultValue;
        return Math.max(min, Math.min(max, num));
    }

    static sanitizeString(str, maxLength = 100) {
        if (!str || typeof str !== 'string') return '';
        return str.trim().substring(0, maxLength);
    }
}

module.exports = SanitizerUtil;
