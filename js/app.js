
const departments = [
  "Haematology",
  "Biochemistry",
  "Microbiology",
  "Serology"
];

const colors = [
  "#2563eb",
  "#0d9488",
  "#d97706",
  "#7c3aed"
];

const charts = {};
const orders = [];

// A reproducible random number generator.
// This keeps our demo data consistent on each reload.
let seed = 2026;

function random() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

// Create 600 synthetic laboratory orders.
for (let i = 0; i < 600; i++) {
  const day = 1 + Math.floor(random() * 30);
  const department = departments[
    Math.floor(random() * departments.length)
  ];

  const statusRandom = random();

  let status = "Completed";

  if (statusRandom < 0.12) {
    status = "Pending";
  } else if (statusRandom < 0.17) {
    status = "Rejected";
  }

  const tat = status === "Completed"
    ? +(0.5 + random() * 7).toFixed(2)
    : null;

  const rejectionReasons = [
    "Haemolysed",
    "Insufficient sample",
    "Incorrect container",
    "Labelling error"
  ];

  orders.push({
    id: `LAB${String(i + 1).padStart(4, "0")}`,
    date: `2026-11-${String(day).padStart(2, "0")}`,
    department: department,
    status: status,
    tat: tat,
    targetTat: 4,
    rejectionReason: status === "Rejected"
      ? rejectionReasons[
          Math.floor(random() * rejectionReasons.length)
        ]
      : null
  });
}

// Return a chart to its initial state before redrawing.
function createChart(id, type, labels, values, label, color) {
  if (charts[id]) {
    charts[id].destroy();
  }

  const ctx = document.getElementById(id);

  charts[id] = new Chart(ctx, {
    type: type,
    data: {
      labels: labels,
      datasets: [{
        label: label,
        data: values,
        backgroundColor: type === "line"
          ? "rgba(37,99,235,0.15)"
          : color,
        borderColor: "#2563eb",
        borderWidth: 2,
        tension: 0.3,
        fill: type === "line"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: type === "doughnut"
        },
        tooltip: {
          enabled: true
        }
      },
      scales: type === "doughnut"
        ? {}
        : {
            y: {
              beginAtZero: true
            }
          }
    }
  });
}

function updateDashboard() {
  const department = document.getElementById(
    "department"
  ).value;

  const startDate = document.getElementById(
    "startDate"
  ).value;

  const endDate = document.getElementById(
    "endDate"
  ).value;

  const filtered = orders.filter(order => {
    const matchesDepartment =
      department === "All" ||
      order.department === department;

    const matchesStart =
      !startDate || order.date >= startDate;

    const matchesEnd =
      !endDate || order.date <= endDate;

    return matchesDepartment &&
      matchesStart &&
      matchesEnd;
  });

  const completed = filtered.filter(
    o => o.status === "Completed"
  );

  const pending = filtered.filter(
    o => o.status === "Pending"
  );

  const compliant = completed.filter(
    o => o.tat <= o.targetTat
  );

  const averageTat = completed.length
    ? completed.reduce((sum, o) => sum + o.tat, 0)
        / completed.length
    : 0;

  const compliance = completed.length
    ? compliant.length / completed.length * 100
    : 0;

  document.getElementById("totalOrders").textContent =
    filtered.length.toLocaleString();

  document.getElementById("averageTat").textContent =
    completed.length ? averageTat.toFixed(2) + " hrs" : "N/A";

  document.getElementById("pendingOrders").textContent =
    pending.length;

  document.getElementById("tatCompliance").textContent =
    completed.length ? compliance.toFixed(1) + "%" : "N/A";

  document.getElementById("filterStatus").textContent =
    `Showing ${filtered.length} synthetic orders.`;

  // Chart 1: Orders by department
  const departmentCounts = departments.map(
    dept => filtered.filter(o => o.department === dept).length
  );

  createChart(
    "departmentChart", "bar", departments,
    departmentCounts, "Orders", colors
  );

  // Chart 2: Daily order volume
  const days = Array.from(
    { length: 30 },
    (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`
  );

  const dailyCounts = days.map(
    day => filtered.filter(o => o.date === day).length
  );

  createChart(
    "dailyChart", "line",
    days.map(d => d.slice(8)),
    dailyCounts, "Daily orders", colors[0]
  );

  // Chart 3: Average TAT by department
  const departmentTat = departments.map(dept => {
    const subset = completed.filter(
      o => o.department === dept
    );

    if (!subset.length) return 0;

    return +(
      subset.reduce((sum, o) => sum + o.tat, 0)
      / subset.length
    ).toFixed(2);
  });

  createChart(
    "tatChart", "bar", departments,
    departmentTat, "Average hours", colors
  );

  // Chart 4: Order status
  const statuses = ["Completed", "Pending", "Rejected"];

  const statusCounts = statuses.map(
    status => filtered.filter(o => o.status === status).length
  );

  createChart(
    "statusChart", "doughnut", statuses,
    statusCounts, "Orders", colors.slice(0, 3)
  );

  // Chart 5: Specimen rejection reasons
  const reasons = [
    "Haemolysed",
    "Insufficient sample",
    "Incorrect container",
    "Labelling error"
  ];

  const rejectionCounts = reasons.map(
    reason => filtered.filter(
      o => o.rejectionReason === reason
    ).length
  );

  createChart(
    "rejectionChart", "bar", reasons,
    rejectionCounts, "Rejected specimens", colors
  );

  // Chart 6: Daily TAT compliance
  const dailyCompliance = days.map(day => {
    const subset = completed.filter(o => o.date === day);

    if (!subset.length) return null;

    const withinTarget = subset.filter(
      o => o.tat <= o.targetTat
    ).length;

    return +(withinTarget / subset.length * 100).toFixed(1);
  });

  createChart(
    "complianceChart", "line",
    days.map(d => d.slice(8)),
    dailyCompliance, "Compliance (%)", colors[0]
  );
}

// Listen for changes to the filters.
document.getElementById("department")
  .addEventListener("change", updateDashboard);

document.getElementById("startDate")
  .addEventListener("change", updateDashboard);

document.getElementById("endDate")
  .addEventListener("change", updateDashboard);

document.getElementById("resetFilters")
  .addEventListener("click", () => {
    document.getElementById("department").value = "All";
    document.getElementById("startDate").value = "";
    document.getElementById("endDate").value = "";

    updateDashboard();
  });

// Display the dashboard when the page loads.
updateDashboard();
