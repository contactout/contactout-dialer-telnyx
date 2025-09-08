// Phone Number Validation and Formatting Utilities
// Supports E.164 format, international validation, and user-friendly formatting

export interface PhoneNumberInfo {
  isValid: boolean;
  isInternational: boolean;
  countryCode: string;
  countryName: string;
  nationalNumber: string;
  e164Format: string;
  formattedNumber: string;
  rawInput: string;
}

export interface CountryInfo {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
  minLength: number;
  maxLength: number;
  format: string;
}

// Major country codes and their information
export const COUNTRY_CODES: Record<string, CountryInfo> = {
  US: {
    code: "US",
    name: "United States",
    dialCode: "1",
    flag: "🇺🇸",
    minLength: 10,
    maxLength: 10,
    format: "(XXX) XXX-XXXX",
  },
  CA: {
    code: "CA",
    name: "Canada",
    dialCode: "1",
    flag: "🇨🇦",
    minLength: 10,
    maxLength: 10,
    format: "(XXX) XXX-XXXX",
  },
  GB: {
    code: "GB",
    name: "United Kingdom",
    dialCode: "44",
    flag: "🇬🇧",
    minLength: 10,
    maxLength: 11,
    format: "XXXX XXXXXX",
  },
  DE: {
    code: "DE",
    name: "Germany",
    dialCode: "49",
    flag: "🇩🇪",
    minLength: 10,
    maxLength: 12,
    format: "XXX XXXXXXXX",
  },
  FR: {
    code: "FR",
    name: "France",
    dialCode: "33",
    flag: "🇫🇷",
    minLength: 9,
    maxLength: 10,
    format: "X XX XX XX XX",
  },
  AU: {
    code: "AU",
    name: "Australia",
    dialCode: "61",
    flag: "🇦🇺",
    minLength: 9,
    maxLength: 9,
    format: "XXX XXX XXX",
  },
  JP: {
    code: "JP",
    name: "Japan",
    dialCode: "81",
    flag: "🇯🇵",
    minLength: 9,
    maxLength: 10,
    format: "XX-XXXX-XXXX",
  },
  IN: {
    code: "IN",
    name: "India",
    dialCode: "91",
    flag: "🇮🇳",
    minLength: 10,
    maxLength: 10,
    format: "XXXXX XXXXX",
  },
  BR: {
    code: "BR",
    name: "Brazil",
    dialCode: "55",
    flag: "🇧🇷",
    minLength: 10,
    maxLength: 11,
    format: "XX XXXXX XXXX",
  },
  MX: {
    code: "MX",
    name: "Mexico",
    dialCode: "52",
    flag: "🇲🇽",
    minLength: 10,
    maxLength: 10,
    format: "XXX XXX XXXX",
  },
  PH: {
    code: "PH",
    name: "Philippines",
    dialCode: "63",
    flag: "🇵🇭",
    minLength: 10,
    maxLength: 10,
    format: "XXX XXX XXXX",
  },
};

// Common country code patterns
const COUNTRY_CODE_PATTERNS = [
  { code: "1", countries: ["US", "CA"] },
  { code: "44", countries: ["GB"] },
  { code: "49", countries: ["DE"] },
  { code: "33", countries: ["FR"] },
  { code: "61", countries: ["AU"] },
  { code: "81", countries: ["JP"] },
  { code: "91", countries: ["IN"] },
  { code: "55", countries: ["BR"] },
  { code: "52", countries: ["MX"] },
  { code: "63", countries: ["PH"] },
];

/**
 * Clean phone number input by removing all non-digit characters except +
 */
export function cleanPhoneNumber(input: string): string {
  if (!input) return "";

  // Keep only digits and + sign
  const cleaned = input.replace(/[^\d+]/g, "");

  // Ensure only one + at the beginning
  if (cleaned.startsWith("+")) {
    return "+" + cleaned.substring(1).replace(/\+/g, "");
  }

  return cleaned;
}

/**
 * Detect country from phone number
 */
export function detectCountry(phoneNumber: string): CountryInfo | null {
  const cleaned = cleanPhoneNumber(phoneNumber);

  // Check for international format (with +)
  if (cleaned.startsWith("+")) {
    const countryCode = cleaned.substring(1);

    for (const pattern of COUNTRY_CODE_PATTERNS) {
      if (countryCode.startsWith(pattern.code)) {
        const country = COUNTRY_CODES[pattern.countries[0]];
        if (country) return country;
      }
    }
  } else {
    // For numbers without +, only check for explicit country codes that are commonly used
    // without + prefix (like "1" for US/Canada)
    if (cleaned.startsWith("1") && cleaned.length >= 10) {
      // US/Canada numbers with explicit "1" prefix
      return COUNTRY_CODES.US;
    }

    // For other international numbers without +, check for specific country codes
    // but be more restrictive to avoid false positives
    for (const pattern of COUNTRY_CODE_PATTERNS) {
      if (pattern.code !== "1" && cleaned.startsWith(pattern.code)) {
        // Check if the number length makes sense for this country
        const country = COUNTRY_CODES[pattern.countries[0]];
        if (country) {
          // For numbers without +, they should be long enough to be clearly international
          // or match the expected length for that country
          const expectedLength = country.minLength + pattern.code.length;
          if (cleaned.length >= expectedLength) {
            return country;
          }
        }
      }
    }
  }

  // Default to US for numbers without country code (like 5551234567)
  return COUNTRY_CODES.US;
}

/**
 * Format phone number for display based on country
 */
export function formatPhoneNumber(
  phoneNumber: string,
  country?: CountryInfo
): string {
  const cleaned = cleanPhoneNumber(phoneNumber);
  const detectedCountry = country || detectCountry(phoneNumber);

  if (!detectedCountry) return cleaned;

  // Check if this is an international call
  const isInternational =
    cleaned.startsWith("+") ||
    (cleaned.startsWith(detectedCountry.dialCode) &&
      detectedCountry.code !== "US");

  // Remove country code for formatting
  let nationalNumber = cleaned;
  if (cleaned.startsWith("+")) {
    const withoutCountry = cleaned.substring(1);
    if (withoutCountry.startsWith(detectedCountry.dialCode)) {
      nationalNumber = withoutCountry.substring(
        detectedCountry.dialCode.length
      );
    }
  }

  // Apply country-specific formatting
  let formattedNumber: string;
  switch (detectedCountry.code) {
    case "US":
    case "CA":
      formattedNumber = formatUSNumber(nationalNumber);
      break;
    case "GB":
      formattedNumber = formatUKNumber(nationalNumber);
      break;
    case "DE":
      formattedNumber = formatGermanNumber(nationalNumber);
      break;
    case "FR":
      formattedNumber = formatFrenchNumber(nationalNumber);
      break;
    case "AU":
      formattedNumber = formatAustralianNumber(nationalNumber);
      break;
    case "JP":
      formattedNumber = formatJapaneseNumber(nationalNumber);
      break;
    case "IN":
      formattedNumber = formatIndianNumber(nationalNumber);
      break;
    case "BR":
      formattedNumber = formatBrazilianNumber(nationalNumber);
      break;
    case "MX":
      formattedNumber = formatMexicanNumber(nationalNumber);
      break;
    case "PH":
      formattedNumber = formatPhilippineNumber(nationalNumber);
      break;
    default:
      formattedNumber = cleaned;
  }

  // Add "+" prefix for international calls (visual only)
  if (isInternational && !formattedNumber.startsWith("+")) {
    // Check if the formatted number already includes the country code
    const hasCountryCode = formattedNumber.startsWith(detectedCountry.dialCode);
    if (hasCountryCode) {
      // Remove the duplicate country code and add + prefix
      const withoutCountryCode = formattedNumber
        .substring(detectedCountry.dialCode.length)
        .trim();
      return `+${detectedCountry.dialCode} ${withoutCountryCode}`;
    } else {
      return `+${detectedCountry.dialCode} ${formattedNumber}`;
    }
  }

  return formattedNumber;
}

/**
 * Format US/Canada phone number: (555) 123-4567
 */
function formatUSNumber(number: string): string {
  const cleaned = number.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `(${cleaned.substring(0, 3)}) ${cleaned.substring(
      3,
      6
    )}-${cleaned.substring(6)}`;
  }
  return number;
}

/**
 * Format UK phone number: 020 7946 0958
 */
function formatUKNumber(number: string): string {
  const cleaned = number.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `${cleaned.substring(0, 3)} ${cleaned.substring(
      3,
      7
    )} ${cleaned.substring(7)}`;
  }
  return number;
}

/**
 * Format German phone number: 030 12345678
 */
function formatGermanNumber(number: string): string {
  const cleaned = number.replace(/\D/g, "");
  if (cleaned.length >= 10) {
    return `${cleaned.substring(0, 3)} ${cleaned.substring(3)}`;
  }
  return number;
}

/**
 * Format French phone number: 1 23 45 67 89
 */
function formatFrenchNumber(number: string): string {
  const cleaned = number.replace(/\D/g, "");
  if (cleaned.length === 9) {
    return `${cleaned.substring(0, 1)} ${cleaned.substring(
      1,
      3
    )} ${cleaned.substring(3, 5)} ${cleaned.substring(
      5,
      7
    )} ${cleaned.substring(7)}`;
  }
  return number;
}

/**
 * Format Australian phone number: 0412 345 678
 */
function formatAustralianNumber(number: string): string {
  const cleaned = number.replace(/\D/g, "");
  if (cleaned.length === 9) {
    return `${cleaned.substring(0, 4)} ${cleaned.substring(
      4,
      7
    )} ${cleaned.substring(7)}`;
  }
  return number;
}

/**
 * Format Japanese phone number: 03-1234-5678
 */
function formatJapaneseNumber(number: string): string {
  const cleaned = number.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `${cleaned.substring(0, 2)}-${cleaned.substring(
      2,
      6
    )}-${cleaned.substring(6)}`;
  }
  return number;
}

/**
 * Format Indian phone number: 98765 43210
 */
function formatIndianNumber(number: string): string {
  const cleaned = number.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `${cleaned.substring(0, 5)} ${cleaned.substring(5)}`;
  }
  return number;
}

/**
 * Format Brazilian phone number: 11 98765 4321
 */
function formatBrazilianNumber(number: string): string {
  const cleaned = number.replace(/\D/g, "");
  if (cleaned.length === 11) {
    return `${cleaned.substring(0, 2)} ${cleaned.substring(
      2,
      7
    )} ${cleaned.substring(7)}`;
  }
  return number;
}

/**
 * Format Mexican phone number: 55 1234 5678
 */
function formatMexicanNumber(number: string): string {
  const cleaned = number.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `${cleaned.substring(0, 2)} ${cleaned.substring(
      2,
      6
    )} ${cleaned.substring(6)}`;
  }
  return number;
}

/**
 * Format Philippine phone number: 917 123 4567
 */
function formatPhilippineNumber(number: string): string {
  const cleaned = number.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `${cleaned.substring(0, 3)} ${cleaned.substring(
      3,
      6
    )} ${cleaned.substring(6)}`;
  }
  return number;
}

/**
 * Convert phone number to E.164 format
 */
export function toE164(phoneNumber: string, country?: CountryInfo): string {
  const cleaned = cleanPhoneNumber(phoneNumber);
  const detectedCountry = country || detectCountry(phoneNumber);

  if (!detectedCountry) return cleaned;

  // If already in E.164 format, return as is
  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  // Remove existing country code if present
  let nationalNumber = cleaned;
  if (cleaned.startsWith(detectedCountry.dialCode)) {
    nationalNumber = cleaned.substring(detectedCountry.dialCode.length);
  }

  // Add country code with +
  return `+${detectedCountry.dialCode}${nationalNumber}`;
}

/**
 * Validate phone number format and length
 */
export function validatePhoneNumber(phoneNumber: string): PhoneNumberInfo {
  const cleaned = cleanPhoneNumber(phoneNumber);
  const country = detectCountry(phoneNumber);

  if (!country) {
    return {
      isValid: false,
      isInternational: false,
      countryCode: "",
      countryName: "",
      nationalNumber: "",
      e164Format: "",
      formattedNumber: cleaned,
      rawInput: phoneNumber,
    };
  }

  // Remove country code for validation
  let nationalNumber = cleaned;
  let isInternational = false;

  if (cleaned.startsWith("+")) {
    isInternational = true;
    const withoutCountry = cleaned.substring(1);
    if (withoutCountry.startsWith(country.dialCode)) {
      nationalNumber = withoutCountry.substring(country.dialCode.length);
    }
  }

  // Validate length
  const isValid =
    nationalNumber.length >= country.minLength &&
    nationalNumber.length <= country.maxLength &&
    /^\d+$/.test(nationalNumber);

  const e164Format = toE164(phoneNumber, country);
  const formattedNumber = formatPhoneNumber(phoneNumber, country);

  return {
    isValid,
    isInternational,
    countryCode: country.code,
    countryName: country.name,
    nationalNumber,
    e164Format,
    formattedNumber,
    rawInput: phoneNumber,
  };
}

/**
 * Validate phone number and return detailed validation results with errors
 */
export function validatePhoneNumberWithErrors(phoneNumber: string): {
  isValid: boolean;
  errors: string[];
  info: PhoneNumberInfo;
} {
  const errors: string[] = [];
  const info = validatePhoneNumber(phoneNumber);

  if (!info.isValid) {
    if (!info.countryCode) {
      errors.push("Unable to detect country code");
    } else {
      const cleaned = cleanPhoneNumber(phoneNumber);
      let nationalNumber = cleaned;

      if (cleaned.startsWith("+")) {
        const withoutCountry = cleaned.substring(1);
        if (withoutCountry.startsWith(info.countryCode)) {
          nationalNumber = withoutCountry.substring(info.countryCode.length);
        }
      }

      if (nationalNumber.length < COUNTRY_CODES[info.countryCode]?.minLength) {
        errors.push(`Phone number too short for ${info.countryName}`);
      } else if (
        nationalNumber.length > COUNTRY_CODES[info.countryCode]?.maxLength
      ) {
        errors.push(`Phone number too long for ${info.countryName}`);
      }

      if (!/^\d+$/.test(nationalNumber)) {
        errors.push("Phone number contains invalid characters");
      }
    }
  }

  return {
    isValid: info.isValid,
    errors,
    info,
  };
}

/**
 * Get country flag emoji
 */
export function getCountryFlag(countryCode: string): string {
  return COUNTRY_CODES[countryCode]?.flag || "🌍";
}

/**
 * Get all available countries
 */
export function getAvailableCountries(): CountryInfo[] {
  return Object.values(COUNTRY_CODES);
}

/**
 * Search countries by name or code
 */
export function searchCountries(query: string): CountryInfo[] {
  const searchTerm = query.toLowerCase();
  return getAvailableCountries().filter(
    (country) =>
      country.name.toLowerCase().includes(searchTerm) ||
      country.code.toLowerCase().includes(searchTerm) ||
      country.dialCode.includes(searchTerm)
  );
}

/**
 * Format phone number as user types (real-time formatting)
 */
export function formatAsYouType(
  input: string,
  previousFormatted: string
): string {
  const cleaned = cleanPhoneNumber(input);
  const country = detectCountry(cleaned);

  if (!country) return cleaned;

  // Don't format if too short
  if (cleaned.length < 3) return cleaned;

  try {
    return formatPhoneNumber(cleaned, country);
  } catch {
    return cleaned;
  }
}
