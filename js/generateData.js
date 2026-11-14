
const fs = require("node:fs");
const path = require("node:path");

// STEP 1: Define laboratory departments and tests

const departments = {
  Haematology: ["FBC", "ESR"],
  Biochemistry: ["RFT", "LFT", "Blood Glucose"],
  Microbiology: ["Urine Culture", "Stool Culture"],
  Serology: ["HIV Screening", "HBsAg"]
};

// Demonstration targets, not official clinical standards
const targets = {
  Haematology: 4,
  Biochemistry: 6,
  Microbiology: 48,
  Serology: 4
};

const rejectionReasons = [
  "Haemolysed",
  "Insufficient sample",
  "Incorrect container",
  "Labelling error"
];

// STEP 2: Create repeatable random data

let seed = 2026;

function random() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

function choose(items) {
  return items[Math.floor(random() * items.length)];
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 3600000);
}

// STEP 3: Generate 1,000 fictional laboratory orders

const rows = [];

for (let i = 1; i <= 1000; i++) {

  const department = choose(Object.keys(departments));
  const test = choose(departments[department]);

  const day = 1 + Math.floor(random() * 30);
  const hour = 7 + Math.floor(random() * 11);
  const minute = Math.floor(random() * 60);

  const received = new Date(
    Date.UTC(2026, 10, day, hour, minute)
  );

  const r = random();

  const status = r < 0.08
    ? "Rejected"
    : r < 0.23
      ? "Pending"
      : "Completed";

  const target = targets[department];

  const duration = 0.5 + random() * target * 1.8;

  const processing = status === "Completed"
    ? addHours(received, 0.25)
    : null;

  const verified = status === "Completed"
    ? addHours(received, Math.max(0.25, duration - 0.2))
    : null;

  const dispatched = status === "Completed"
    ? addHours(received, duration)
    : null;

  const rejectionReason = status === "Rejected"
    ? choose(rejectionReasons)
    : "";

  rows.push({
    order_id: `LAB${String(i).padStart(4, "0")}`,
    department: department,
    test_category: test,
    received_at: received.toISOString(),
    processing_started_at: processing
      ? processing.toISOString() : "",
    verified_at: verified
      ? verified.toISOString() : "",
    dispatched_at: dispatched
      ? dispatched.toISOString() : "",
    status: status,
    target_tat_hours: target,
    rejection_reason: rejectionReason
  });
}

// STEP 4: Define CSV column names

const headers = [
  "order_id",
  "department",
  "test_category",
  "received_at",
  "processing_started_at",
  "verified_at",
  "dispatched_at",
  "status",
  "target_tat_hours",
  "rejection_reason"
];

// STEP 5: Convert records into CSV format

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

const csv = [
  headers.join(","),
  ...rows.map(row =>
    headers.map(header => csvCell(row[header])).join(",")
  )
].join("\n");

// STEP 6: Save the CSV file

const outputPath = path.join(
  __dirname,
  "..",
  "data",
  "laboratory_orders.csv"
);

fs.mkdirSync(path.dirname(outputPath), {
  recursive: true
});

fs.writeFileSync(outputPath, csv, "utf8");

// STEP 7: Display confirmation

console.log("LABTRACK DATA GENERATION SUCCESSFUL!");
console.log(`Created ${rows.length} synthetic laboratory orders.`);
console.log(`Saved to: ${outputPath}`);
