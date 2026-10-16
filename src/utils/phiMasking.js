/**
 * src/utils/phiMasking.js
 * HIPAA Privacy Rule Minimum Necessary & De-Identification Utility
 * Standards: 45 CFR § 164.502(b), § 164.514(a)-(b)
 */

/**
 * Masks a Medical Record Number (MRN) to preserve minimum-necessary visibility.
 * @param {string|number} mrn - Full MRN
 * @param {boolean} [hasFullAccess=false] - Whether actor has patients.view_phi authority
 * @returns {string} Masked MRN or original if authorized
 */
export function maskMRN(mrn, hasFullAccess = false) {
  if (hasFullAccess || !mrn) return String(mrn || '');
  const str = String(mrn).trim();
  if (str.length <= 3) return '***';
  return '***' + str.slice(-3);
}

/**
 * Masks a patient contact phone number.
 * @param {string} phone - Full phone number
 * @param {boolean} [hasFullAccess=false] - Whether actor has patients.view_phi authority
 * @returns {string} Masked phone number
 */
export function maskPhone(phone, hasFullAccess = false) {
  if (hasFullAccess || !phone) return String(phone || '');
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 4) return '***-****';
  return `(***) ***-${digits.slice(-4)}`;
}

/**
 * Masks a Date of Birth to year only or asterisked representation.
 * @param {string} dob - Full Date of Birth (YYYY-MM-DD or MM/DD/YYYY)
 * @param {boolean} [hasFullAccess=false] - Whether actor has patients.view_phi authority
 * @returns {string} Masked DOB
 */
export function maskDOB(dob, hasFullAccess = false) {
  if (hasFullAccess || !dob) return String(dob || '');
  const str = String(dob).trim();
  const yearMatch = str.match(/\b(19\d\d|20\d\d)\b/);
  if (yearMatch) {
    return `**/**/${yearMatch[1]}`;
  }
  return '**/**/****';
}

/**
 * Masks a patient's full name to initials with asterisks.
 * @param {string} name - Full patient name
 * @param {boolean} [hasFullAccess=false] - Whether actor has patients.view_phi authority
 * @returns {string} Masked patient name
 */
export function maskPatientName(name, hasFullAccess = false) {
  if (hasFullAccess || !name) return String(name || '');
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return 'Patient ***';
  return parts.map(p => `${p.charAt(0)}***`).join(' ');
}

/**
 * Creates a sanitized, minimum-necessary projection of a patient record.
 * @param {Object} patient - Raw patient object
 * @param {boolean} [hasFullAccess=false] - Whether actor has patients.view_phi authority
 * @returns {Object} Sanitized patient record
 */
export function sanitizePatientRecord(patient, hasFullAccess = false) {
  if (!patient || typeof patient !== 'object') return patient;
  if (hasFullAccess) return { ...patient };

  return {
    ...patient,
    name: maskPatientName(patient.name, false),
    firstname: patient.firstname ? `${patient.firstname.charAt(0)}***` : '',
    lastname: patient.lastname ? `${patient.lastname.charAt(0)}***` : '',
    mrn: maskMRN(patient.mrn, false),
    dob: maskDOB(patient.dob, false),
    phone: maskPhone(patient.phone, false),
    email: patient.email ? '***@***.***' : '',
    address: patient.address ? '[Redacted for Privacy]' : '',
    insurance_policy_number: patient.insurance_policy_number ? '***' + String(patient.insurance_policy_number).slice(-4) : '',
    insurance_group_number: patient.insurance_group_number ? '***' + String(patient.insurance_group_number).slice(-4) : ''
  };
}

/**
 * Sanitizes an operational surgery record, masking attached patient identifiers if unauthorized.
 * @param {Object} surgery - Raw surgery object
 * @param {boolean} [hasFullAccess=false] - Whether actor has patients.view_phi authority
 * @returns {Object} Sanitized surgery record
 */
export function sanitizeSurgeryRecord(surgery, hasFullAccess = false) {
  if (!surgery || typeof surgery !== 'object') return surgery;
  if (hasFullAccess) return { ...surgery };

  const sanitized = { ...surgery };
  if (sanitized.patients) {
    sanitized.patients = sanitizePatientRecord(sanitized.patients, false);
  }
  if (sanitized.patient_name) {
    sanitized.patient_name = maskPatientName(sanitized.patient_name, false);
  }
  return sanitized;
}

/**
 * De-identifies arbitrary prompt text before sending to AI services.
 * Strips SSNs, phone numbers, email addresses, and MRN patterns.
 * @param {string} text - Raw input text
 * @returns {string} De-identified text safe for AI processing
 */
export function deidentifyTextForAI(text) {
  if (!text || typeof text !== 'string') return '';

  return text
    // Replace SSNs (xxx-xx-xxxx)
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED-SSN]')
    // Replace Phone Numbers
    .replace(/(?:\+?1[-. ]?)?\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})/g, '[REDACTED-PHONE]')
    // Replace Email Addresses
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED-EMAIL]')
    // Replace MRN-formatted patterns
    .replace(/\b(?:MRN|mrn)[-:\s]*([A-Za-z0-9_-]+)\b/g, 'MRN-[REDACTED]')
    // Replace Dates of Birth patterns (DOB: MM/DD/YYYY)
    .replace(/\b(?:DOB|dob|Date of Birth)[-:\s]*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi, 'DOB:[REDACTED]');
}
