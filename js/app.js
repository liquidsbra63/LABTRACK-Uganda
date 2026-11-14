
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
let orders = [];

async function loadLaboratoryData() {
  try {
    const response = await fetch("data/laboratory_orders.csv");

    if (!response.ok) {
      throw new Error("Unable to load laboratory CSV");
    }

    const csvText = await response.text();

    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true
    });

    if (parsed.errors.length > 0) {
      throw new Error("There was a problem reading the CSV");
    }

    orders = parsed.data.map(row => {
      const received = new Date(row.received_at);

      const dispatched = row.dispatched_at
        ? new Date(row.dispatched_at)
        : null;

      const tat = row.status === "Completed" && dispatched
        ? (dispatched - received) / 3600000
        : null;

      return {
        id: row.order_id,
        date: row.received_at.slice(0, 10),
        department: row.department,
        status: row.status,
        tat: tat,
        targetTat: Number(row.target_tat_hours),
        rejectionReason: row.rejection_reason || null
      };
    });

    console.log(
      "Successfully loaded laboratory orders:",
      orders.length
    );

    updateDashboard();

  } catch (error) {
    console.error("CSV loading error:", error);

    document.getElementById("filterStatus").textContent =
      "Error loading laboratory data.";
  }
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

function exportSummaryCSV() {
  const department = document.getElementById("department").value;
  const startDate = document.getElementById("startDate").value;
  const endDate = document.getElementById("endDate").value;

  // Use the same filters as the dashboard
  const filtered = orders.filter(order =>
    (department === "All" || order.department === department) &&
    (!startDate || order.date >= startDate) &&
    (!endDate || order.date <= endDate)
  );

  const headers = [
    "Department",
    "Total Orders",
    "Completed",
    "Pending",
    "Rejected",
    "Average TAT Hours",
    "TAT Compliance Percent"
  ];

  const rows = departments.map(dept => {
    const subset = filtered.filter(
      order => order.department === dept
    );

    const completed = subset.filter(
      order => order.status === "Completed"
    );

    const pending = subset.filter(
      order => order.status === "Pending"
    );

    const rejected = subset.filter(
      order => order.status === "Rejected"
    );

    const averageTat = completed.length
      ? completed.reduce((sum, order) => sum + order.tat, 0)
        / completed.length
      : null;

    const compliant = completed.filter(
      order => order.tat <= order.targetTat
    ).length;

    const compliance = completed.length
      ? compliant / completed.length * 100
      : null;

    return [
      dept,
      subset.length,
      completed.length,
      pending.length,
      rejected.length,
      averageTat === null ? "" : averageTat.toFixed(2),
      compliance === null ? "" : compliance.toFixed(1)
    ];
  });

  // Convert summary rows into CSV
  const csv = [headers, ...rows]
    .map(row => row.join(","))
    .join("\r\n");

  // Create downloadable CSV file
  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "LABTRACK_department_summary.csv";

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
document.getElementById("exportCSV")
  .addEventListener("click", exportSummaryCSV);

// Load the CSV dataset when the page starts.
loadLaboratoryData();
