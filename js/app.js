
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
let laboratoryDataLoaded = false;
let laboratoryDataLoading = false;
let dataLoadVersion = 0;


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
          "order_id, department, received_at, " +
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
