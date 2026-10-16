// Pure validation for the work tracker (clients, owners, transactions).
// No I/O here, so it can be unit-tested with node:test.

const LIMITS = {
  client: [2, 60],
  owner: [2, 60],
  number: [1, 40],
  partTitle: [1, 80],
  type: [1, 80],
  notes: 1000,
  password: 128,
  nationalId: 14,
};

const STATUSES = ["ongoing", "done"];

class RuleError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status || 400;
  }
}

function inRange(s, [min, max]) {
  return s.length >= min && s.length <= max;
}

function text(v) {
  return typeof v === "string" ? v.trim() : "";
}

function checkClientName(v) {
  const name = text(v);
  if (!inRange(name, LIMITS.client)) throw new RuleError("badname");
  return name;
}

// Owners need a name, a part address, and a 14-digit national ID. The
// password is optional. Passing "" means "no password".
function checkOwner(input) {
  const name = text(input.name);
  const partAddress = text(input.partAddress);
  const nationalId = text(input.nationalId);
  const password = typeof input.password === "string" ? input.password : "";
  if (!inRange(name, LIMITS.owner)) throw new RuleError("badname");
  if (!inRange(partAddress, LIMITS.partTitle)) throw new RuleError("badaddress");
  if (!new RegExp("^\\d{" + LIMITS.nationalId + "}$").test(nationalId)) {
    throw new RuleError("badnid");
  }
  if (password.length > LIMITS.password) throw new RuleError("badpass");
  return { name, partAddress, nationalId, password };
}

function checkTx(input, { requireAll }) {
  const out = {};
  if (requireAll || input.clientId !== undefined) {
    if (typeof input.clientId !== "string" || !input.clientId) throw new RuleError("badinput");
    out.clientId = input.clientId;
  }
  if (requireAll || input.number !== undefined) {
    const number = text(input.number);
    if (!inRange(number, LIMITS.number)) throw new RuleError("badnumber");
    out.number = number;
  }
  if (requireAll || input.partTitle !== undefined) {
    const partTitle = text(input.partTitle);
    if (!inRange(partTitle, LIMITS.partTitle)) throw new RuleError("badpart");
    out.partTitle = partTitle;
  }
  if (requireAll || input.type !== undefined) {
    const type = text(input.type);
    if (!inRange(type, LIMITS.type)) throw new RuleError("badtype");
    out.type = type;
  }
  if (requireAll || input.notes !== undefined) {
    const notes = typeof input.notes === "string" ? input.notes.trim() : "";
    if (notes.length > LIMITS.notes) throw new RuleError("badnotes");
    out.notes = notes;
  }
  if (requireAll || input.status !== undefined) {
    if (!STATUSES.includes(input.status)) throw new RuleError("badstatus");
    out.status = input.status;
  }
  return out;
}

module.exports = { LIMITS, STATUSES, RuleError, checkClientName, checkOwner, checkTx };
