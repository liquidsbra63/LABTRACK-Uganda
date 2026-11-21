
/*
  LABTRACK Uganda
  Lesson 4.8 — Supabase Database Integration

  Data source: Supabase laboratory_orders
  Authentication: Supabase Auth
  Authorization: PostgreSQL RLS
*/

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
let tatBenchmarks = [];
let ugandaHealthReference = [];
let laboratoryDataLoaded = false;
let laboratoryDataLoading = false;
let dataLoadVersion = 0;

// ==========================================
// LOAD LABORATORY TAT BENCHMARKS FROM CSV
// ==========================================

async function loadTatBenchmarks() {
  const response = await fetch(
    "data/laboratory_tat_benchmarks.csv",
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error(
      "Unable to load laboratory TAT benchmarks."
    );
  }

  const csvText = await response.text();

  const lines = csvText.trim().split(/\r?\n/);

  const headers = lines[0]
    .split(",")
    .map(value => value.trim());

  const expectedHeaders = [
    "department",
    "benchmark_tat_hours",
    "benchmark_source"
  ];

  if (
    expectedHeaders.some(
      (header, index) => headers[index] !== header
    )
  ) {
    throw new Error("Unexpected benchmark CSV columns.");
  }

  const benchmarks = lines.slice(1).map(line => {
    const values = line.split(",").map(value => value.trim());

    return {
      department: values[0],
      benchmarkTatHours: Number(values[1]),
      benchmarkSource: values[2]
    };
  });

  if (
    benchmarks.length !== 4 ||
    benchmarks.some(
      item =>
        !departments.includes(item.department) ||
        !Number.isFinite(item.benchmarkTatHours) ||
        item.benchmarkTatHours <= 0
    ) ||
    new Set(
      benchmarks.map(item => item.department)
    ).size !== 4
  ) {
    throw new Error("Invalid laboratory TAT benchmark data.");
  }

  return benchmarks;
}
async function loadUgandaHealthReference() {
  const response = await fetch("data/uganda_health_reference.csv", {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Unable to load Uganda TAT reference CSV.");
  }

  const csvText = await response.text();
  const lines = csvText.trim().split(/\r?\n/);

  if (lines.length !== 3) {
    throw new Error("Expected two national TAT reference records.");
  }

  const expectedHeaders = [
    "laboratory",
    "reporting_period",
    "indicator",
    "value_percent",
    "source"
  ];

  const headers = lines[0].split(",").map(value => value.trim());

  if (
    headers.length !== expectedHeaders.length ||
    expectedHeaders.some((header, index) => headers[index] !== header)
  ) {
    throw new Error("Unexpected national TAT reference CSV columns.");
  }

  const records = lines.slice(1).map(line => {
    const values = line.split(",").map(value => value.trim());

    if (values.length !== expectedHeaders.length) {
      throw new Error("Invalid national TAT reference CSV row.");
    }

    return {
      laboratory: values[0],
      reportingPeriod: values[1],
      indicator: values[2],
      valuePercent: Number(values[3]),
      source: values[4]
    };
  });

  for (const record of records) {
    if (
      record.laboratory !== "National Microbiology Reference Laboratory" ||
      record.indicator !== "Routine results within target TAT" ||
      !Number.isFinite(record.valuePercent) ||
      record.valuePercent < 0 ||
      record.valuePercent > 100
    ) {
      throw new Error("Invalid national TAT reference value.");
    }
  }

  return records;
}

function updateNationalTatPanel() {
  const previousElement = document.getElementById("nationalTatPrevious");
  const currentElement = document.getElementById("nationalTatCurrent");
  const changeElement = document.getElementById("nationalTatChange");

  if (!previousElement || !currentElement || !changeElement) {
    return;
  }

  const previous = ugandaHealthReference.find(
    record => record.reportingPeriod === "FY2024/25"
  );

  const current = ugandaHealthReference.find(
    record => record.reportingPeriod === "FY2025/26"
  );

  if (!previous || !current) {
    previousElement.textContent = "--%";
    currentElement.textContent = "--%";
    changeElement.textContent = "National TAT compliance change: --";
    return;
  }

  previousElement.textContent = `${previous.valuePercent}%`;
  currentElement.textContent = `${current.valuePercent}%`;

  const difference = current.valuePercent - previous.valuePercent;
  const sign = difference > 0 ? "+" : "";

  changeElement.textContent =
    `National TAT compliance change: ${sign}${difference} percentage points`;
}

// ==========================================
// 1. LOAD AUTHORIZED DATA FROM SUPABASE
// ==========================================

async function loadLaboratoryData() {

  if (laboratoryDataLoading) {
    return;
  }

  const version = ++dataLoadVersion;

  laboratoryDataLoading = true;
  laboratoryDataLoaded = false;
  orders = [];
  tatBenchmarks = [];

  const statusElement =
    document.getElementById("filterStatus");

  statusElement.textContent =
    "Loading laboratory records from Supabase...";

  try {

    // Confirm the user is authenticated
    const { data: userData, error: userError } =
      await supabaseClient.auth.getUser();

    if (userError || !userData.user) {
      throw new Error(
        "You must log in to access laboratory records."
      );
    }

    const userId = userData.user.id;

    // Verify the staff role
    const { data: profile, error: profileError } =
      await supabaseClient
        .from("staff_profiles")
        .select("role")
        .eq("user_id", userId)
        .single();

    if (
      profileError ||
      !profile ||
      !["manager", "technologist"].includes(profile.role)
    ) {
      throw new Error(
        "Your account is not authorized to view laboratory records."
      );
    }

    // Retrieve all accessible records in batches
    const batchSize = 500;
    let offset = 0;
    const allRecords = [];

    while (true) {

      const { data, error } = await supabaseClient
        .from("laboratory_orders")
        .select(
         "order_id, department, test_category, received_at, " +
         "dispatched_at, status, target_tat_hours, " +
         "rejection_reason"
        )
        .order("order_id", { ascending: true })
        .range(offset, offset + batchSize - 1);

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        break;
      }

      allRecords.push(...data);

      if (data.length < batchSize) {
        break;
      }

      offset += batchSize;
    }

    // Discard results from a previous session
    const { data: currentSession } =
      await supabaseClient.auth.getSession();

    if (
      version !== dataLoadVersion ||
      currentSession.session?.user.id !== userId
    ) {
      return;
    }

    // Load the second data source: reference benchmarks
const loadedBenchmarks = await loadTatBenchmarks();
const loadedHealthReference = await loadUgandaHealthReference();

// Prevent an old login session from updating benchmark data
const { data: benchmarkSession } =
  await supabaseClient.auth.getSession();

if (
  version !== dataLoadVersion ||
  benchmarkSession.session?.user.id !== userId
) {
  return;
}

tatBenchmarks = loadedBenchmarks;
ugandaHealthReference = loadedHealthReference;


console.log(
  "LABTRACK: Loaded national TAT reference:",
  ugandaHealthReference
);
updateNationalTatPanel();

console.log(
  "LABTRACK: Loaded TAT benchmarks from CSV:",
  tatBenchmarks.length
);
    // Convert database records into dashboard format
    orders = allRecords.map(row => {

      const received = new Date(row.received_at);

      const dispatched = row.dispatched_at
        ? new Date(row.dispatched_at)
        : null;

      const tat =
        row.status === "Completed" && dispatched
          ? (dispatched - received) / 3600000
          : null;

      return {
  id: row.order_id,
  date: row.received_at.slice(0, 10),
  department: row.department,
  testCategory: row.test_category,
  status: row.status,
  tat: tat,
  targetTat: Number(row.target_tat_hours),
  rejectionReason: row.rejection_reason || null
};
    });

    laboratoryDataLoaded = true;

    console.log(
      "LABTRACK: Loaded records from Supabase:",
      orders.length
    );

    updateDashboard();

  } catch (error) {

    if (version !== dataLoadVersion) {
      return;
    }

    console.error(
      "Supabase laboratory data loading error:",
      error
    );

    statusElement.textContent =
      "Unable to load laboratory data: " +
      error.message;

  } finally {

    if (version === dataLoadVersion) {
      laboratoryDataLoading = false;
    }

  }
}


// ==========================================
// 2. CLEAR DATA WHEN USER LOGS OUT
// ==========================================

function clearLaboratoryData() {

  dataLoadVersion++;

  orders = [];
  tatBenchmarks = [];
  ugandaHealthReference = [];
  updateNationalTatPanel();
  
  laboratoryDataLoaded = false;
  laboratoryDataLoading = false;

  Object.keys(charts).forEach(id => {
    charts[id].destroy();
    delete charts[id];
  });

  document.getElementById("totalOrders").textContent = "0";
  document.getElementById("averageTat").textContent = "N/A";
  document.getElementById("pendingOrders").textContent = "0";
  document.getElementById("tatCompliance").textContent = "N/A";

  document.getElementById("filterStatus").textContent = "";
}


// ==========================================
// 3. CREATE OR UPDATE CHARTS
// ==========================================

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
  animation: false,

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


// ==========================================
// 4. FILTER LABORATORY ORDERS
// ==========================================

function getFilteredOrders() {

  const department =
    document.getElementById("department").value;

  const startDate =
    document.getElementById("startDate").value;

  const endDate =
    document.getElementById("endDate").value;

  return orders.filter(order => {

    const matchesDepartment =
      department === "All" ||
      order.department === department;

    const matchesStart =
      !startDate || order.date >= startDate;

    const matchesEnd =
      !endDate || order.date <= endDate;

    return (
      matchesDepartment &&
      matchesStart &&
      matchesEnd
    );
  });
}


// ==========================================
// 5. UPDATE DASHBOARD
// ==========================================

function updateDashboard() {

  if (!laboratoryDataLoaded) {
    return;
  }

  const filtered = getFilteredOrders();

  const completed = filtered.filter(
    o => o.status === "Completed"
  );

  const pending = filtered.filter(
    o => o.status === "Pending"
  );

  const compliant = completed.filter(
    o => o.tat !== null &&
         o.tat <= o.targetTat
  );

  const averageTat = completed.length
    ? completed.reduce(
        (sum, o) => sum + (o.tat || 0), 0
      ) / completed.length
    : 0;

  const compliance = completed.length
    ? compliant.length / completed.length * 100
    : 0;

  // Update KPI cards
  document.getElementById("totalOrders").textContent =
    filtered.length.toLocaleString();

  document.getElementById("averageTat").textContent =
    completed.length
      ? averageTat.toFixed(2) + " hrs"
      : "N/A";

  document.getElementById("pendingOrders").textContent =
    pending.length;

  document.getElementById("tatCompliance").textContent =
    completed.length
      ? compliance.toFixed(1) + "%"
      : "N/A";

  document.getElementById("filterStatus").textContent =
    `Showing ${filtered.length.toLocaleString()} ` +
    `of ${orders.length.toLocaleString()} ` +
    `authorized synthetic laboratory orders from Supabase.`;


  // ------------------------------------------
  // Chart 1: Orders by department
  // ------------------------------------------

  const departmentCounts = departments.map(
    dept => filtered.filter(
      o => o.department === dept
    ).length
  );

  createChart(
    "departmentChart",
    "bar",
    departments,
    departmentCounts,
    "Orders",
    colors
  );


  // ------------------------------------------
  // Chart 2: Daily laboratory orders
  // ------------------------------------------

  // Use the dates actually present in the data
  const days = [
    ...new Set(
      filtered.map(order => order.date)
    )
  ].sort();

  const dailyCounts = days.map(
    day => filtered.filter(
      o => o.date === day
    ).length
  );

  createChart(
    "dailyChart",
    "line",
    days,
    dailyCounts,
    "Daily orders",
    colors[0]
  );


  // ------------------------------------------
  // Chart 3: Average TAT by department
  // ------------------------------------------

  const departmentTat = departments.map(dept => {

    const subset = completed.filter(
      o => o.department === dept &&
           o.tat !== null
    );

    if (!subset.length) {
      return 0;
    }

    return +(
      subset.reduce(
        (sum, o) => sum + o.tat, 0
      ) / subset.length
    ).toFixed(2);

  });

  createChart(
    "tatChart",
    "bar",
    departments,
    departmentTat,
    "Average hours",
    colors
  );


  // ------------------------------------------
  // Chart 4: Orders by status
  // ------------------------------------------

  const statuses = [
    "Completed",
    "Pending",
    "Rejected"
  ];

  const statusCounts = statuses.map(
    status => filtered.filter(
      o => o.status === status
    ).length
  );

  createChart(
    "statusChart",
    "doughnut",
    statuses,
    statusCounts,
    "Orders",
    colors.slice(0, 3)
  );


  // ------------------------------------------
  // Chart 5: Specimen rejection reasons
  // ------------------------------------------

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
    "rejectionChart",
    "bar",
    reasons,
    rejectionCounts,
    "Rejected specimens",
    colors
  );


  // ------------------------------------------
  // Chart 6: Daily TAT compliance
  // ------------------------------------------

  const dailyCompliance = days.map(day => {

    const subset = completed.filter(
      o => o.date === day &&
           o.tat !== null
    );

    if (!subset.length) {
      return null;
    }

    const withinTarget = subset.filter(
      o => o.tat <= o.targetTat
    ).length;

    return +(
      withinTarget / subset.length * 100
    ).toFixed(1);

  });

  createChart(
    "complianceChart",
    "line",
    days,
    dailyCompliance,
    "Compliance (%)",
    colors[0]
  );
// Update benchmark comparison using current filters
updateBenchmarkChart(filtered);

}

// ==========================================
// LABORATORY TAT BENCHMARK COMPARISON
// ==========================================

function updateBenchmarkChart(filteredOrders) {

  if (!tatBenchmarks.length) {
    return;
  }

  const actualTat = departments.map(dept => {

    const completed = filteredOrders.filter(
      order =>
        order.department === dept &&
        order.status === "Completed" &&
        order.tat !== null
    );

    if (!completed.length) {
      return null;
    }

    const totalTat = completed.reduce(
      (sum, order) => sum + order.tat,
      0
    );

    return +(totalTat / completed.length).toFixed(2);
  });

  const benchmarkTat = departments.map(dept => {

    const benchmark = tatBenchmarks.find(
      item => item.department === dept
    );

    return benchmark
      ? benchmark.benchmarkTatHours
      : null;
  });

  const canvas = document.getElementById("benchmarkChart");

  if (!canvas) {
    console.error("Benchmark chart canvas not found.");
    return;
  }

  if (charts.benchmarkChart) {
    charts.benchmarkChart.destroy();
  }

  charts.benchmarkChart = new Chart(canvas, {
    type: "bar",

    data: {
      labels: departments,

      datasets: [
        {
          label: "Actual Average TAT (hours)",
          data: actualTat,
          backgroundColor: "#2563eb"
        },
        {
          label: "Illustrative Benchmark (hours)",
          data: benchmarkTat,
          backgroundColor: "#d97706"
        }
      ]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,

      plugins: {
        legend: {
          display: true
        },
        tooltip: {
          enabled: true
        }
      },

      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Turnaround Time (Hours)"
          }
        }
      }
    }
  });

  const status = document.getElementById("benchmarkStatus");

  if (status) {
    status.textContent =
      "Comparing completed laboratory orders " +
      "with illustrative departmental TAT benchmarks.";
  }
}
// ==========================================
// 6. EXPORT SUMMARY CSV
// ==========================================

async function exportSummaryCSV() {

  if (!laboratoryDataLoaded) {
    alert("Laboratory data has not finished loading.");
    return;
  }

  // Verify current role before exporting
  const { data: userData, error: userError } =
    await supabaseClient.auth.getUser();

  if (userError || !userData.user) {
    alert("Please log in before exporting.");
    return;
  }

  const { data: profile, error: profileError } =
    await supabaseClient
      .from("staff_profiles")
      .select("role")
      .eq("user_id", userData.user.id)
      .single();

  if (profileError || profile?.role !== "manager") {
    alert("Only Laboratory Managers can export reports.");
    return;
  }

  const filtered = getFilteredOrders();

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

    const validCompleted = completed.filter(
      order => order.tat !== null
    );

    const averageTat = validCompleted.length
      ? validCompleted.reduce(
          (sum, order) => sum + order.tat, 0
        ) / validCompleted.length
      : null;

    const compliant = validCompleted.filter(
      order => order.tat <= order.targetTat
    ).length;

    const compliance = validCompleted.length
      ? compliant / validCompleted.length * 100
      : null;

    return [
      dept,
      subset.length,
      completed.length,
      pending.length,
      rejected.length,
      averageTat === null
        ? ""
        : averageTat.toFixed(2),
      compliance === null
        ? ""
        : compliance.toFixed(1)
    ];
  });

  const csv = [headers, ...rows]
    .map(row => row.join(","))
    .join("\r\n");

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

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);

}


// ==========================================
// 7. FILTER EVENT LISTENERS
// ==========================================

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


// IMPORTANT:
// Do not automatically load laboratory records here.
// Authentication will trigger loadLaboratoryData().
