/* ============================================================
   TIMEZONE — MUST BE FIRST
   ============================================================ */
process.env.TZ = "Asia/Dhaka";

/* ============================================================
   IMPORTS
   ============================================================ */
require("dotenv").config();
const cron = require("node-cron");
const path = require("path");
const dns = require("node:dns");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const {
    PersonSchema,
    TransactionSchema,
    EntriesSchema,
    LedgerPersonSchema,
    PawnaPersonSchema,
    BankSchema,
    UserSchema,
} = require("./schema");

dns.setServers(["1.1.1.1", "8.8.8.8"]);

/* ============================================================
   APP + MIDDLEWARE
   ============================================================ */
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ============================================================
   MODELS
   ============================================================ */
const Person = mongoose.model("Person", PersonSchema);
const Transaction = mongoose.model("Transaction", TransactionSchema);
const Entries = mongoose.model("Entries", EntriesSchema);
const LedgerPerson = mongoose.model("LedgerPerson", LedgerPersonSchema);
const PawnaPerson = mongoose.model("Pawna", PawnaPersonSchema);
const Bank = mongoose.model("Bank", BankSchema);
const User = mongoose.model("User", UserSchema);

mongoose
    .connect(process.env.DB_URL)
    .then(() => console.log("Cloud Database connected successfully!"))
    .catch((err) => console.error("Cloud DB connection error:", err));

/* ============================================================
   LIMITS
   ============================================================ */
const DAILY_LIMIT = 50000;
const MONTHLY_LIMIT = 300000;

/* ============================================================
   HELPERS
   ============================================================ */
const wrap = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;

    }
}

const isId = (id) => mongoose.Types.ObjectId.isValid(id);

const toNumber = (value, fallback = 0) => {
    if (value === undefined || value === null || value === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

function dayKey(d = new Date()) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function monthKey(d = new Date()) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

function getUsage(person) {
    const now = new Date();
    const tKey = dayKey(now);
    const mKey = monthKey(now);
    const dailyUsed = person.baseDayKey === tKey ? Number(person.dailyUsedBase) || 0 : 0;
    const monthlyUsed = person.baseMonthKey === mKey ? Number(person.monthlyUsedBase) || 0 : 0;
    return {
        dailyUsed, monthlyUsed,
        remDaily: DAILY_LIMIT - dailyUsed,
        remMonthly: MONTHLY_LIMIT - monthlyUsed,
    };
}

/* ============================================================
   AUTH MIDDLEWARE
   ============================================================ */
async function requireAuth(req, res, next) {
    try {
        const raw = String(req.headers["x-user-id"] || "").trim();
        if (!mongoose.Types.ObjectId.isValid(raw)) {
            return res.status(401).json({ error: "Not authenticated" });
        }
        const user = await User.findById(raw).lean();
        if (!user) return res.status(401).json({ error: "Invalid session" });
        req.user = user;
        next();
    } catch (err) {
        next(err);
    }
}

/* ============================================================
   ROUTES — PEOPLE
   ============================================================ */
app.post("/api/people", requireAuth, wrap(async (req, res) => {
    const { name, bkashNumber, whatsappNumber, initialBalance, dailyUsedBase, monthlyUsedBase, baseDayKey, baseMonthKey } = req.body;
    const now = new Date();
    const person = await Person.create({
        owner: req.user._id,
        name, bkashNumber,
        whatsappNumber: whatsappNumber || undefined,
        initialBalance: toNumber(initialBalance),
        dailyUsedBase: toNumber(dailyUsedBase),
        monthlyUsedBase: toNumber(monthlyUsedBase),
        baseDayKey: baseDayKey || dayKey(now),
        baseMonthKey: baseMonthKey || monthKey(now),
    });
    res.status(201).json(person);
}));

app.get("/api/people", requireAuth, wrap(async (req, res) => {
    const people = await Person.find({ owner: req.user._id })
        .populate("transactions")
        .sort({ createdAt: -1 });
    res.json(people);
}));

app.get("/api/people/:id", requireAuth, wrap(async (req, res) => {
    if (!isId(req.params.id)) throw new HttpError(400, "Invalid id");
    const person = await Person
        .findOne({ _id: req.params.id, owner: req.user._id })
        .populate("transactions");
    if (!person) throw new HttpError(404, "Person not found");
    res.json(person);
}));

app.get("/api/people/:id/usage", requireAuth, wrap(async (req, res) => {
    if (!isId(req.params.id)) throw new HttpError(400, "Invalid id");
    const person = await Person.findOne({ _id: req.params.id, owner: req.user._id });
    if (!person) throw new HttpError(404, "Person not found");
    const u = getUsage(person);
    res.json({
        dailyLimit: DAILY_LIMIT, monthlyLimit: MONTHLY_LIMIT,
        ...u,
        dailyBlocked: u.remDaily <= 0,
        monthlyBlocked: u.remMonthly <= 0,
    });
}));

app.patch("/api/people/:id", requireAuth, wrap(async (req, res) => {
    if (!isId(req.params.id)) throw new HttpError(400, "Invalid id");
    const update = {};
    const b = req.body || {};
    if (b.name !== undefined) update.name = b.name;
    if (b.whatsappNumber !== undefined) update.whatsappNumber = b.whatsappNumber;
    if (b.initialBalance !== undefined) update.initialBalance = toNumber(b.initialBalance);
    if (b.dailyUsedBase !== undefined) update.dailyUsedBase = toNumber(b.dailyUsedBase);
    if (b.monthlyUsedBase !== undefined) update.monthlyUsedBase = toNumber(b.monthlyUsedBase);
    if (b.baseDayKey !== undefined) update.baseDayKey = b.baseDayKey;
    if (b.baseMonthKey !== undefined) update.baseMonthKey = b.baseMonthKey;

    const person = await Person.findOneAndUpdate(
        { _id: req.params.id, owner: req.user._id },
        update,
        { new: true, runValidators: true }
    ).populate("transactions");
    if (!person) throw new HttpError(404, "Person not found");
    res.json(person);
}));

app.delete("/api/people/:id", requireAuth, wrap(async (req, res) => {
    if (!isId(req.params.id)) throw new HttpError(400, "Invalid id");
    const person = await Person.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!person) throw new HttpError(404, "Person not found");
    await Transaction.deleteMany({ person: person._id, owner: req.user._id });
    res.json({ msg: "ok" });
}));

/* ============================================================
   ROUTES — TRANSACTIONS
   ============================================================ */
async function createTransaction(req, res) {
    const personId = req.params.id;
    if (!isId(personId)) throw new HttpError(400, "Invalid id");
    const { type, counterparty, date, trxId, notes } = req.body;
    const amount = Number(req.body.amount);

    if (!["send", "receive"].includes(type)) throw new HttpError(400, "Invalid transaction type");
    if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, "Amount must be more than 0");

    const person = await Person.findOne({ _id: personId, owner: req.user._id });
    if (!person) throw new HttpError(404, "Person not found");

    const now = new Date();
    const tKey = dayKey(now);
    const mKey = monthKey(now);
    const curDaily = person.baseDayKey === tKey ? Number(person.dailyUsedBase) || 0 : 0;
    const curMonthly = person.baseMonthKey === mKey ? Number(person.monthlyUsedBase) || 0 : 0;

    if (type === "send") {
        if (curDaily >= DAILY_LIMIT) throw new HttpError(400, "exceeds daily limit");
        if (curMonthly >= MONTHLY_LIMIT) throw new HttpError(400, "exceeds monthly limit");
        if (curDaily + amount > DAILY_LIMIT) throw new HttpError(400, "exceeds daily limit");
        if (curMonthly + amount > MONTHLY_LIMIT) throw new HttpError(400, "exceeds monthly limit");
        if (amount > Number(person.initialBalance || 0)) throw new HttpError(400, "not enough balance");
    }

    const cleanTrx = trxId ? String(trxId).toUpperCase().trim() : null;
    if (cleanTrx) {
        const dup = await Transaction.findOne({ person: personId, trxId: cleanTrx });
        if (dup) throw new HttpError(400, "TrxID already exists");
    }

    const transaction = await Transaction.create({
        owner: req.user._id,
        person: personId, type, amount,
        date: date ? new Date(date) : now,
        counterparty: counterparty || undefined,
        trxId: cleanTrx || undefined,
        verified: Boolean(cleanTrx),
        notes: notes || undefined,
    });

    if (person.baseDayKey !== tKey) { person.dailyUsedBase = 0; person.baseDayKey = tKey; }
    if (person.baseMonthKey !== mKey) { person.monthlyUsedBase = 0; person.baseMonthKey = mKey; }

    if (type === "send") {
        person.bundleCount = Number(person.bundleCount) - 1;
        person.initialBalance = Number(person.initialBalance) - amount;
        person.dailyUsedBase = Number(person.dailyUsedBase) + amount;
        person.monthlyUsedBase = Number(person.monthlyUsedBase) + amount;
    } else {
        person.initialBalance = Number(person.initialBalance) + amount;
    }

    person.transactions.push(transaction._id);
    await person.save();
    res.status(201).json(transaction);
}

app.post("/api/transactions/:id", requireAuth, wrap(createTransaction));
app.post("/api/people/:id/transactions", requireAuth, wrap(createTransaction));

app.delete("/api/transactions/:id", requireAuth, wrap(async (req, res) => {
    if (!isId(req.params.id)) throw new HttpError(400, "Invalid id");
    const transaction = await Transaction.findOneAndDelete({
        _id: req.params.id,
        owner: req.user._id,
    });
    if (!transaction) throw new HttpError(404, "Transaction not found");
    await Person.updateOne(
        { _id: transaction.person, owner: req.user._id },
        { $pull: { transactions: transaction._id } }
    );
    res.json({ msg: "ok" });
}));

/* ============================================================
   BUNDLE UPDATE
   ============================================================ */
app.patch("/api/people/bandle/:id", requireAuth, wrap(async (req, res) => {
    if (!isId(req.params.id)) throw new HttpError(400, "Invalid id");
    const { bundleCount, bundleExpiry } = req.body;
    const update = {};
    if (bundleCount !== undefined) {
        update.bundleCount = toNumber(bundleCount);
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30);
        update.bundleExpiry = expiry;
    } else if (bundleExpiry !== undefined) {
        update.bundleExpiry = bundleExpiry ? new Date(bundleExpiry) : null;
    }
    const person = await Person.findOneAndUpdate(
        { _id: req.params.id, owner: req.user._id },
        update,
        { new: true, runValidators: true }
    );
    if (!person) throw new HttpError(404, "Person not found");
    res.json(person);
}));

/* ============================================================
   LEDGER PERSONS  (ইজি লেনদেন — one page per person)
   ============================================================ */
const ledgerPersonOut = (p) => ({
    id: p._id.toString(),
    name: p.name,
    openingBalance: p.openingBalance,
    createdAt: p.createdAt,
});

app.get("/persons", requireAuth, wrap(async (req, res) => {
    const list = await LedgerPerson.find({ owner: req.user._id }).sort({ createdAt: 1 });
    res.json(list.map(ledgerPersonOut));
}));

app.post("/persons", requireAuth, wrap(async (req, res) => {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    if (!name) throw new HttpError(400, "নাম দিতে হবে");
    if (name.length > 60) throw new HttpError(400, "নাম ৬০ অক্ষরের বেশি হতে পারবে না");

    /* ইজা is required — 0 is fine, but it must be sent */
    if (body.openingBalance === undefined || body.openingBalance === null || body.openingBalance === "") {
        throw new HttpError(400, "শুরুর ইজা দিতে হবে (না থাকলে ০)");
    }
    const openingBalance = Number(body.openingBalance);
    if (!Number.isFinite(openingBalance)) throw new HttpError(400, "শুরুর ইজা সংখ্যায় দিতে হবে");

    try {
        const person = await LedgerPerson.create({ owner: req.user._id, name, openingBalance });
        res.status(201).json(ledgerPersonOut(person));
    } catch (err) {
        if (err.code === 11000) throw new HttpError(400, "এই নামে আগেই একজন আছে");
        throw err;
    }
}));

app.delete("/persons/:id", requireAuth, wrap(async (req, res) => {
    const { id } = req.params;
    if (!isId(id)) throw new HttpError(400, "ভুল আইডি");
    const person = await LedgerPerson.findOneAndDelete({ _id: id, owner: req.user._id });
    if (!person) throw new HttpError(404, "ব্যক্তি খুঁজে পাওয়া যায়নি");
    /* a person's entries go with them */
    const gone = await Entries.deleteMany({ owner: req.user._id, personId: person._id });
    res.json({ ok: true, deletedEntries: gone.deletedCount });
}));

/* ============================================================
   ENTRIES (bKash) — every entry belongs to a ledger person.
   No personId (query/body) = the old pre-multi-person entries.
   ============================================================ */

/* personId from ?query or body → ObjectId, or null for legacy entries */
function readPersonId(raw) {
    if (raw === undefined || raw === null || raw === "") return null;
    if (!isId(raw)) throw new HttpError(400, "ভুল personId");
    return new mongoose.Types.ObjectId(String(raw));
}

/* filter for one person's entries on one date */
function dayFilter(req) {
    return {
        owner: req.user._id,
        date: req.params.date,
        personId: readPersonId(req.query.personId),   // null also matches legacy docs with no field
    };
}

app.post("/entries", requireAuth, wrap(async (req, res) => {
    const { date, entries, total, count, raw, deposit } = req.body;
    if (!date || !Array.isArray(entries) || entries.length === 0) {
        throw new HttpError(400, "date and entries required");
    }
    const personId = readPersonId(req.body.personId);
    if (personId) {
        const exists = await LedgerPerson.exists({ _id: personId, owner: req.user._id });
        if (!exists) throw new HttpError(404, "ব্যক্তি খুঁজে পাওয়া যায়নি");
    }

    const safeTotal = Number(total) || entries.reduce((s, e) => s + (+e.amount || 0), 0);
    const safeCount = Number(count) || entries.length;
    const saved = await Entries.create({
        owner: req.user._id,
        personId,
        date,
        raw: raw || "",
        entries,
        total: safeTotal,
        deposit,
        count: safeCount,
    });
    res.status(201).json(saved);
}));

app.get("/entries", requireAuth, wrap(async (req, res) => {
    const filter = { owner: req.user._id };
    if (req.query.personId) filter.personId = readPersonId(req.query.personId);   // optional narrowing
    const data = await Entries.find(filter).sort({ createdAt: 1 }).lean();
    res.status(200).json(data);
}));

/* update জমা for one person's day */
app.patch("/entries/by-date/:date", requireAuth, wrap(async (req, res) => {
    const deposit = Number(req.body && req.body.deposit);
    if (!Number.isFinite(deposit) || deposit < 0) throw new HttpError(400, "deposit সংখ্যা হতে হবে");
    /* জমা is read from the day's latest non-zero entry, so keep it on the
       latest entry only and clear it on any earlier ones */
    const filter = dayFilter(req);
    const doc = await Entries.findOne(filter).sort({ createdAt: -1 });
    if (!doc) throw new HttpError(404, "এই তারিখে কোনো এন্ট্রি পাওয়া যায়নি");
    await Entries.updateMany({ ...filter, _id: { $ne: doc._id } }, { $set: { deposit: 0 } });
    doc.deposit = deposit;
    await doc.save();
    res.json(doc);
}));

/* delete the whole day of one person (all entries saved on that date) */
app.delete("/entries/by-date/:date", requireAuth, wrap(async (req, res) => {
    const del = await Entries.deleteMany(dayFilter(req));
    if (!del.deletedCount) throw new HttpError(404, "এই তারিখে কোনো এন্ট্রি পাওয়া যায়নি");
    res.json({ ok: true, deleted: del.deletedCount });
}));

/* ============================================================
   PAWNA
   ============================================================ */
function summarize(person) {
    const totalSend = person.totalSend || 0;
    const totalReceive = person.totalReceive || 0;
    const net = totalSend - totalReceive;
    return { totalSend, totalReceive, net, status: net > 0 ? "pabe" : net < 0 ? "debe" : "soman" };
}

app.get("/api/pawna/people", requireAuth, wrap(async (req, res) => {
    const people = await PawnaPerson.find({ owner: req.user._id }).sort({ createdAt: -1 });
    const out = people.map((p) => ({
        id: p._id.toString(),
        name: p.name,
        createdAt: p.createdAt,
        summary: summarize(p),
        transactions: (p.transactions || []).slice()
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .map((t) => ({
                id: t._id.toString(),
                type: t.type,
                amount: t.amount,
                date: t.date,
                notes: t.notes ?? null,
            })),
    }));
    res.json({ people: out });
}));

app.post("/api/pawna/people", requireAuth, wrap(async (req, res) => {
    const name = String((req.body && req.body.name) || "").trim();
    if (!name) throw new HttpError(400, "নাম দিতে হবে");
    const person = await PawnaPerson.create({
        owner: req.user._id,
        name,
        totalSend: 0,
        totalReceive: 0,
        transactions: [],
    });
    res.status(201).json({
        person: {
            id: person._id.toString(),
            name: person.name,
            createdAt: person.createdAt,
            summary: summarize(person),
            transactions: [],
        },
    });
}));

app.post("/api/pawna/people/:id/transactions", requireAuth, wrap(async (req, res) => {
    const body = req.body || {};
    const { type } = body;
    const amount = Number(body.amount);
    if (type !== "send" && type !== "receive") throw new HttpError(400, "type অবশ্যই send অথবা receive");
    if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, "amount ধনাত্মক হতে হবে");

    const txn = {
        type,
        amount,
        date: body.date ? new Date(body.date) : new Date(),
        notes: body.notes ?? null,
    };
    const person = await PawnaPerson.findOneAndUpdate(
        { _id: req.params.id, owner: req.user._id },
        {
            $push: { transactions: txn },
            $inc: type === "send" ? { totalSend: amount } : { totalReceive: amount },
        },
        { new: true, runValidators: true }
    );
    if (!person) throw new HttpError(404, "মানুষ খুঁজে পাওয়া যায়নি");

    const created = person.transactions[person.transactions.length - 1];
    res.status(201).json({
        transaction: {
            id: created._id.toString(),
            type: created.type,
            amount: created.amount,
            date: created.date,
            notes: created.notes ?? null,
        },
        summary: summarize(person),
    });
}));

app.delete("/api/pawna/people/:id/transactions/:txnId", requireAuth, wrap(async (req, res) => {
    const { id, txnId } = req.params;
    const person = await PawnaPerson.findOne({ _id: id, owner: req.user._id });
    if (!person) throw new HttpError(404, "মানুষ খুঁজে পাওয়া যায়নি");
    const txn = person.transactions.id(txnId);
    if (!txn) throw new HttpError(404, "লেনদেন খুঁজে পাওয়া যায়নি");
    person.transactions.pull(txnId);
    await person.save();
    res.json({ ok: true, summary: summarize(person) });
}));

app.delete("/api/pawna/people/:id", requireAuth, wrap(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new HttpError(400, "ভুল আইডি");
    const person = await PawnaPerson.findOneAndDelete({ _id: id, owner: req.user._id });
    if (!person) throw new HttpError(404, "মানুষ খুঁজে পাওয়া যায়নি");
    res.json({ ok: true });
}));

/* ============================================================
   BANK
   ============================================================ */
function computeTotalsFromTransactions(transactions) {
    let totalDeposit = 0, totalWithdraw = 0;
    (transactions || []).forEach((t) => {
        const a = Number(t.amount || 0);
        if (t.type === "withdraw") totalWithdraw += a;
        else totalDeposit += a;
    });
    return { totalDeposit, totalWithdraw };
}

function bankSummary(bank) {
    let totalDeposit, totalWithdraw;
    if (typeof bank.totalDeposit === "number" && typeof bank.totalWithdraw === "number") {
        totalDeposit = bank.totalDeposit;
        totalWithdraw = bank.totalWithdraw;
    } else {
        const t = computeTotalsFromTransactions(bank.transactions);
        totalDeposit = t.totalDeposit;
        totalWithdraw = t.totalWithdraw;
    }
    return { totalDeposit, totalWithdraw, balance: totalDeposit - totalWithdraw };
}

function shapeBank(b) {
    const txns = (b.transactions || []).slice()
        .sort((a, c) => new Date(a.date) - new Date(c.date));
    return {
        id: b._id.toString(),
        name: b.name,
        accountNumber: b.accountNumber || "",
        createdAt: b.createdAt,
        summary: bankSummary(b),
        transactions: txns.map((t) => ({
            id: t._id.toString(),
            type: t.type,
            amount: t.amount,
            date: t.date,
            name: t.name ?? null,
            notes: t.notes ?? null,
        })),
    };
}

async function ensureTotals(bank) {
    if (typeof bank.totalDeposit === "number" && typeof bank.totalWithdraw === "number") return bank;
    const { totalDeposit, totalWithdraw } = computeTotalsFromTransactions(bank.transactions);
    await Bank.collection.updateOne(
        { _id: bank._id, owner: bank.owner },
        { $set: { totalDeposit, totalWithdraw } }
    );
    bank.totalDeposit = totalDeposit;
    bank.totalWithdraw = totalWithdraw;
    return bank;
}

app.get("/api/banks", requireAuth, wrap(async (req, res) => {
    const banks = await Bank.find({ owner: req.user._id }).sort({ createdAt: 1 }).lean();
    const out = [];
    for (const b of banks) { await ensureTotals(b); out.push(shapeBank(b)); }
    res.json({ banks: out });
}));

app.post("/api/banks", requireAuth, wrap(async (req, res) => {
    const name = String((req.body && req.body.name) || "").trim();
    const accountNumber = String((req.body && req.body.accountNumber) || "").trim();
    if (!name) throw new HttpError(400, "নাম দিতে হবে");
    const bank = await Bank.create({
        owner: req.user._id,
        name,
        accountNumber,
        totalDeposit: 0,
        totalWithdraw: 0,
    });
    const fresh = await Bank.findById(bank._id).lean();
    res.status(201).json({ bank: shapeBank(fresh) });
}));

app.delete("/api/banks/:id", requireAuth, wrap(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new HttpError(400, "ভুল আইডি");
    const bank = await Bank.findOneAndDelete({ _id: id, owner: req.user._id });
    if (!bank) throw new HttpError(404, "ব্যাংক খুঁজে পাওয়া যায়নি");
    res.json({ ok: true });
}));

app.post("/api/banks/:id/transactions", requireAuth, wrap(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new HttpError(400, "ভুল আইডি");
    const bank = await Bank.findOne({ _id: id, owner: req.user._id }).lean();
    if (!bank) throw new HttpError(404, "ব্যাংক খুঁজে পাওয়া যায়নি");
    await ensureTotals(bank);

    const body = req.body || {};
    const { type } = body;
    const amount = Number(body.amount);
    if (type !== "deposit" && type !== "withdraw") throw new HttpError(400, "type অবশ্যই deposit অথবা withdraw");
    if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, "amount ধনাত্মক হতে হবে");

    const txn = {
        _id: new mongoose.Types.ObjectId(),
        type,
        amount,
        date: body.date ? new Date(body.date) : new Date(),
        name: body.name ? String(body.name).trim() : null,
        notes: body.notes ? String(body.notes).trim() : null,
    };

    await Bank.collection.updateOne(
        { _id: bank._id, owner: req.user._id },
        {
            $push: { transactions: txn },
            $inc: {
                totalDeposit: type === "deposit" ? amount : 0,
                totalWithdraw: type === "withdraw" ? amount : 0,
            },
        }
    );

    const fresh = await Bank.findById(id).lean();
    res.status(201).json({
        transaction: {
            id: txn._id.toString(),
            type: txn.type,
            amount: txn.amount,
            date: txn.date,
            name: txn.name,
            notes: txn.notes,
        },
        summary: bankSummary(fresh),
    });
}));

app.delete("/api/banks/:id/transactions/:txnId", requireAuth, wrap(async (req, res) => {
    const { id, txnId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(txnId)) {
        throw new HttpError(400, "ভুল আইডি");
    }
    const bank = await Bank.findOne({ _id: id, owner: req.user._id }).lean();
    if (!bank) throw new HttpError(404, "ব্যাংক খুঁজে পাওয়া যায়নি");
    await ensureTotals(bank);

    const result = await Bank.collection.updateOne(
        { _id: bank._id, owner: req.user._id },
        { $pull: { transactions: { _id: new mongoose.Types.ObjectId(txnId) } } }
    );

    if (result.matchedCount === 0) throw new HttpError(404, "ব্যাংক খুঁজে পাওয়া যায়নি");
    if (result.modifiedCount === 0) throw new HttpError(404, "লেনদেন খুঁজে পাওয়া যায়নি");

    const fresh = await Bank.findById(id).lean();
    res.json({ ok: true, summary: bankSummary(fresh) });
}));

/* ============================================================
   AUTH — plain PIN, no hashing
   ============================================================ */
function normalizePhone(raw) {
    let d = String(raw || "").replace(/\D/g, "");
    if (d.startsWith("880")) d = d.slice(3);
    else if (d.startsWith("88")) d = d.slice(2);
    if (d.length === 10 && d.startsWith("1")) d = "0" + d;
    return /^01[3-9]\d{8}$/.test(d) ? d : "";
}

const publicUser = (u) => ({
    id: u._id.toString(),
    phone: u.phone,
    createdAt: u.createdAt,
});

/* POST /api/auth/check */
app.post("/api/auth/check", wrap(async (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    if (!phone) throw new HttpError(400, "অবৈধ নম্বর");
    const user = await User.findOne({ phone }).lean();
    res.json({ exists: !!user });
}));

/* POST /api/auth/register */
app.post("/api/auth/register", wrap(async (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    const pin = String(req.body?.pin || "");

    if (!phone) throw new HttpError(400, "অবৈধ নম্বর");
    if (!/^\d{4}$/.test(pin)) throw new HttpError(400, "৪ ডিজিটের পিন দিন");

    const existing = await User.findOne({ phone });

    if (existing) return res.status(409).json({ message: "এই নম্বরে অ্যাকাউন্ট আছে" });
    // console.log(phone, pin);
    const user = await User.create({ phone, pin });
    console.log(user);
    res.status(201).json({ user: publicUser(user) });
}));

/* POST /api/auth/login */
app.post("/api/auth/login", wrap(async (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    const pin = String(req.body?.pin || "");

    if (!phone || !/^\d{4}$/.test(pin)) throw new HttpError(400, "অবৈধ ইনপুট");

    const user = await User.findOne({ phone });
    if (!user || user.pin !== pin) return res.status(401).json({ message: "ভুল পিন!" });

    res.json({ user: publicUser(user) });
}));


/* POST /api/auth/me — pass { id } in body */
app.post("/api/auth/me", wrap(async (req, res) => {
    const raw = String(req.body?.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(raw)) throw new HttpError(400, "id দরকার");

    const user = await User.findById(raw);
    if (!user) return res.status(401).json({ message: "সেশন অবৈধ" });

    res.json({ user: publicUser(user) });
}));

/* POST /api/auth/logout */
app.post("/api/auth/logout", (_req, res) => res.json({ ok: true }));

/* ============================================================
   ERROR HANDLER — MUST BE LAST
   ============================================================ */
app.use((err, req, res, next) => {
    if (err.code === 11000) {
        return res.status(400).json({ error: "Already exists" });
    }
    if (err.name === "ValidationError") {
        return res.status(400).json({
            error: Object.values(err.errors).map((e) => e.message).join(", "),
        });
    }

    const status = err.status || 500;
    if (status === 500) console.error(err);

    res.status(status).json({
        error: status === 500 ? "Internal server error" : err.message,
    });
});

/* ============================================================
   START
   ============================================================ */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
    console.log(`Today: ${dayKey(new Date())}`);
});

cron.schedule("0 0 * * *", async () => {
    try {
        const result = await Person.updateMany(
            { bundleExpiry: { $lte: new Date() } },
            { $set: { bundleCount: 0, bundleExpiry: null } }
        );
        console.log(`Expired ${result.modifiedCount} bundles.`);
    } catch (err) {
        console.error("Bundle expiry cron failed:", err.message);
    }
});

module.exports = app;