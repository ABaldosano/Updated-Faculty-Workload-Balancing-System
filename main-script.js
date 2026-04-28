/* ============================
   1. GLOBAL VARIABLES & SETTINGS
============================ */
window.dashboardChartSort = {
  order: 'asc',       // ascending by default
  colorFilter: null   // no filter selected yet
};

const lastSort = { key: 'slot', ascending: true }; // global table sort state

function toUnits(hours){
    return hours / 2;
}

/* ============================
   2. DASHBOARD CHART SETUP
============================ */
const ctxDash = document.getElementById("dashboardChart").getContext("2d");
window.dashboardChart = new Chart(ctxDash, {
  type: "bar",
  data: {
    labels: [],
    datasets: [{
      label: "Assignments (units) per Faculty",
      data: [], 
      backgroundColor: []
    }]
  },
  options: {
    responsive: true,
    scales: { y: { beginAtZero: true } },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          generateLabels: function(chart) {
            return [
              { text: 'Normal', fillStyle: '#88E788' },
              { text: 'Max Load', fillStyle: '#FF6700' },
              { text: 'Over / Under Load', fillStyle: '#FF0000' }
            ];
          }
        },
        onClick: function(e, legendItem, legend) {
          const selectedColor = legendItem.fillStyle;
          const chart = legend.chart;
          const dataset = chart.data.datasets[0];

          let combined = chart.data.labels.map((label, i) => ({
            label,
            value: dataset.data[i],
            color: dataset.backgroundColor[i]
          }));

          if (!chart.sortOrder) chart.sortOrder = 'asc';

          combined.sort((a, b) => {
            const orderMap = { '#88E788': 0, '#FF6700': 1, '#FF0000': 2 };
            let diff = orderMap[a.color] - orderMap[b.color];

            // PRIORITIZE clicked color
            if (a.color === selectedColor) diff = -1;
            if (b.color === selectedColor) diff = 1;

            return chart.sortOrder === 'asc' ? diff : -diff;
          });

          chart.data.labels = combined.map(d => d.label);
          chart.data.datasets[0].data = combined.map(d => d.value);
          chart.data.datasets[0].backgroundColor = combined.map(d => d.color);
          chart.update();
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const prof = context.label;
            const units = context.raw;
            let status = '';
            const maxUnits = 24;
            if(units > maxUnits) status = ' ⚠ OVERLOAD';
            else if(units === maxUnits) status = ' ⚠ MAX LOAD';
            else if(units <= 2) status = ' ⚠ TOO LOW';
            return `${prof}: ${units}units${status}`;
          }
        }
      }
    }
  },
});

/* ============================
   3. REPORTS PIE CHART SETUP
============================ */
const ctxRep = document.getElementById("reportsChart").getContext("2d");
window.reportsChart = new Chart(ctxRep, {
  type: "pie",
  data: { labels: [], datasets: [{ data: [], backgroundColor: [
'#7ED6DF','#F0932B','#EB4D4B','#6AB04C','#BE2EDD',
'#22A6B3','#F9CA24','#BADC58','#E056FD','#FF7979']}]},
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        callbacks: {
          label: function(context) {
            const profName = context.label;
            const units = context.raw;
            let status = '';
            const maxUnits = 24;
            if(units >= maxUnits){
              status = units > maxUnits ? ' (OVERLOAD)' : ' (MAX LOAD)';
            }
            return `${profName}: ${units} units${status}`;
          }
        }
      }
    }
  }
});

const ctxRepBar = document.getElementById("reportsBarChart").getContext("2d");

window.reportsBarChart = new Chart(ctxRepBar, {
  type: "bar",
  data: {
    labels: [],
    datasets: [{
      label: "Total Teaching Units",
      data: [],
      backgroundColor: []
    }]
  },
  options: {
    indexAxis: 'y', // makes it TOP → BOTTOM (leaderboard style)
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      x: { beginAtZero: true },
      y: { ticks: { autoSkip: false } }
    }
  }
});

// MINI DASHBOARD CHART (live during GA)
const ctxMini = document.getElementById("miniDashChart").getContext("2d");
window.miniDashChart = new Chart(ctxMini, {
    type: 'bar',
    data: {
        labels: [],      // faculty names
        datasets: [{
            label: 'Current Load (h)',
            data: [],
            backgroundColor: []
        }]
    },
    options: {
      responsive: false,
      animation: {
          duration: 150 // smooth but fast
      },
      plugins: { legend: { display: false } },
      scales: {
          y: { beginAtZero: true, max: 30 }
      }
  }
});

/* ============================
   4. PANEL SWITCHING
============================ */
const navMenu = document.querySelector('.nav-menu');
const panels = document.querySelectorAll('.panel');
const container = document.querySelector('.panels-container');

let currentPanel = 0;
const panelWidth = panels[0].offsetWidth + 40;
let scrollCounter = 0;
const scrollThreshold = 2; // number of scrolls per panel switch

function switchPanel(index){
  container.style.transform = `translateX(-${index * panelWidth}px)`;
  panels[index].scrollTop = 0;

  const navItems = navMenu.querySelectorAll('.nav-item');
  navItems.forEach(item => item.classList.remove('active'));
  if(navItems[index]) navItems[index].classList.add('active');

  currentPanel = index;

  setTimeout(() => {
    if (window.dashboardChart) window.dashboardChart.resize();
}, 300);
}

// SCROLL NAVBAR TO SWITCH PANELS
navMenu.addEventListener('wheel', e => {
  e.preventDefault();
  scrollCounter++;

  if(scrollCounter >= scrollThreshold){
    if(e.deltaY > 0 && currentPanel < panels.length-1) currentPanel++;
    if(e.deltaY < 0 && currentPanel > 0) currentPanel--;

    switchPanel(currentPanel);
    scrollCounter = 0;
  }
});

/* ============================
   5. GA (GENETIC ALGORITHM) HANDLING
============================ */
const runBtn = document.getElementById("runGA");
const loading = document.getElementById("gaLoading");
const tableWrapper = document.getElementById("gaTableWrapper");
const genCounter = document.getElementById("generationCounter");

const progressFill = document.querySelector("#gaProgressBar .fill");

// convert percent to RGB (red -> yellow -> green)
function getProgressColor(percent) {
    let r, g, b = 0;

    if(percent <= 50){
        // red -> yellow
        r = 255;
        g = Math.floor(255 * (percent / 50));
    } else {
        // yellow -> green
        g = 255;
        r = Math.floor(255 * ((100 - percent) / 50));
    }

    return `rgb(${r},${g},${b})`;
}

// call this every GA update
function updateProgress(current, total){
    const percent = Math.min(100, (current / total) * 100);
    progressFill.style.width = percent + "%";
    progressFill.style.backgroundColor = getProgressColor(percent);
}

runBtn.addEventListener("click", async () => {
    const popSize = document.getElementById("populationSize").value;
    const generations = document.getElementById("numGenerations").value;
    const mutRate = document.getElementById("mutationRate").value;
    const crossover = document.getElementById("crossoverRate").value;

    loading.classList.remove("hidden");
    tableWrapper.classList.add("hidden");
    runBtn.disabled = true;

    // Reset progress bar & generation counter
    if(progressFill){
        progressFill.style.width = "0%";
        progressFill.style.transition = "width 0.2s linear";
    }
    genCounter.textContent = "0";

    try {
        await startGA(popSize, generations, mutRate, crossover); // THIS is the correct call
    } catch(err){
        console.error(err);
        loading.classList.add("hidden");
        runBtn.disabled = false;
        return;
    }

    // =======================
    // LIVE GA PROGRESS UPDATE
    // =======================
    const interval = setInterval(async () => {
        try {
            const res = await fetch("http://localhost:5000/progress");
            const data = await res.json();

            const percent = data.total ? Math.min(100, (data.current / data.total) * 100) : 0;

            // update generation counter
            genCounter.textContent = data.current || "0";

            // update progress bar width AND color
            if(progressFill){
                progressFill.style.width = percent + "%";
                progressFill.style.backgroundColor = getProgressColor(percent);
            }

            // update mini chart
            if(typeof updateMiniFromServer === "function") updateMiniFromServer(data);

            if(!data.running){
                clearInterval(interval);
                tableWrapper.classList.remove("hidden");
                loading.classList.add("hidden");
                runBtn.disabled = false;

                if(Array.isArray(data.result) && data.result.length > 0){
                    renderGASchedule(data.result);
                    updateCharts(data.result);
                    updateReportsPanel(data.result);
                }
            }
        } catch(err){
            console.error("Error fetching GA progress:", err);
        }
    }, 200);
});

/* ============================
   6. CHARTS UPDATE FUNCTION
============================ */
function updateCharts(data) {
    if (!window.dashboardChart) return;

    const maxUnits = 24;

    const counts = {};
    data.forEach(item => {
        if (!item.faculty) return;
        counts[item.faculty] = (counts[item.faculty] || 0) + 2;
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const labels = sorted.map(e => e[0]);
    const values = sorted.map(e => Number(e[1]));

    const colors = values.map(v => 
        v > maxUnits ? '#FF0000' :
        v === maxUnits ? '#FF6700' :
        v <= 2 ? '#FF0000' : 
        '#88E788'
    );

    const dataset = window.dashboardChart.data.datasets[0];
    dataset.data = values;
    dataset.backgroundColor = colors;

    window.dashboardChart.data.labels = labels;
    window.dashboardChart.update();
    window.dashboardChart.resize();

    window.reportsBarChart.data.labels = labels;
    window.reportsBarChart.data.datasets[0].data = values;
    window.reportsBarChart.data.datasets[0].backgroundColor = colors;
    window.reportsBarChart.update();

    const originalLabels = Object.keys(counts);
    const originalValues = Object.values(counts);
    window.reportsChart.data.labels = originalLabels;
    window.reportsChart.data.datasets[0].data = originalValues;
    window.reportsChart.update();
}


function updateReportsPanel(data){
    const maxUnits = 24;

    const counts = {};
    const daysPerProf = {};

    data.forEach(item => {
        counts[item.faculty] = (counts[item.faculty] || 0) + 2;

        if(!daysPerProf[item.faculty]) daysPerProf[item.faculty] = {};
        const day = item.slot.split(':')[0].trim();
        daysPerProf[item.faculty][day] = (daysPerProf[item.faculty][day] || 0) + 1;
    });

    const labels = Object.keys(counts);
    const values = Object.values(counts);

    const barColors = values.map(v => {
        if(v > maxUnits) return '#FF0000';
        if(v === maxUnits) return '#FF6700';
        if(v <= 4) return '#FF0000';
        return '#88E788';
    });

    const tbody = document.querySelector("#reportsSummaryTable tbody");
    tbody.innerHTML = "";

    labels.forEach(faculty => {
        const profDays = Object.entries(daysPerProf[faculty])
                               .map(([day,units]) => `${day}: ${units}u`)
                               .join(', ');

        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${faculty}</td>
            <td>${profDays}</td>
            <td>${counts[faculty]}</td>
        `;
        tbody.appendChild(row);
    });
}


function updateMiniFromServer(data) {
    if(!data || !data.result) return;

    const counts = {};
    data.result.forEach(item => {
        counts[item.faculty] = (counts[item.faculty] || 0) + 2;
    });

    const labels = Object.keys(counts);
    const values = Object.values(counts);
    const colors = values.map(v => {
        if(v > 24) return '#FF0000';
      if(v === 24) return '#FF6700';
      if(v <= 4) return '#FF0000';
        return '#88E788';
    });

    window.miniDashChart.data.labels = labels;
    window.miniDashChart.data.datasets[0].data = values;
    window.miniDashChart.data.datasets[0].backgroundColor = colors;
    window.miniDashChart.update();
}



/* ================= Export Functions ================= */
document.getElementById("exportCSV").onclick = () => {
    const rows = Array.from(document.querySelectorAll("#reportsSummaryTable tr"));
    const csv = rows.map(r => Array.from(r.children).map(td => td.innerText).join(",")).join("\n");
    const blob = new Blob([csv], {type: 'text/csv'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'reports_summary.csv';
    link.click();
};

document.getElementById("exportPDF").onclick = () => {
    // Using jsPDF library (needs )
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const table = document.getElementById("reportsSummaryTable");

    let y = 20;
    doc.setFontSize(14);
    doc.text("Faculty Load Summary", 14, y);
    y += 10;

    Array.from(table.rows).forEach((row, i) => {
        Array.from(row.cells).forEach((cell, j) => {
            doc.text(cell.innerText, 14 + j*60, y);
        });
        y += 10;
    });

    doc.save("reports_summary.pdf");
};

/* ============================
   7. GA SCHEDULE TABLE RENDERING
============================ */
function renderGASchedule(data){
    const tableBody = document.querySelector("#gaScheduleTable tbody");
    tableBody.innerHTML = "";

    const dayOrder = {Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5};

    // Default sort: Mon → Sat then unit
    data.sort((a,b)=>{
        const parseSlot = (slot) => {
            const [dayPart, timePart] = slot.split(':');
            const day = dayPart.trim();
            const unit = parseInt(timePart.split('-')[0].trim());
            return { day, unit };
        };
        const sA = parseSlot(a.slot); const sB = parseSlot(b.slot);
        return (dayOrder[sA.day]-dayOrder[sB.day]) || (sA.unit-sB.unit);
    });

    // Apply last sort
    const key = lastSort.key;
    const ascending = lastSort.ascending;
    data.sort((a,b)=>{
        let valA = a[key], valB = b[key];
        if(key === "slot"){
            const parseSlot = slot => {
                const [dayPart, timePart] = slot.split(':');
                const day = dayPart.trim();
                const unit = parseInt(timePart.split('-')[0].trim());
                return { day, unit };
            };
            const sA = parseSlot(valA); const sB = parseSlot(valB);
            const dayDiff = dayOrder[sA.day]-dayOrder[sB.day];
            if(dayDiff!==0) return dayDiff*(ascending?1:-1);
            return (sA.unit-sB.unit)*(ascending?1:-1);
        }
        if(!isNaN(valA) && !isNaN(valB)) return (valA-valB)*(ascending?1:-1);
        return valA.localeCompare(valB)*(ascending?1:-1);
    });

    data.forEach(item=>{
        const row = document.createElement("tr");
        const day = item.slot.split(':')[0].trim();
        const dayColors = {Mon:"#FFF9C4", Tue:"#E6CCFF", Wed:"#DFF5E1", Thu:"#FFE5B4", Fri:"#D6E4FF", Sat:"#C8A2C8"};
        row.style.backgroundColor = dayColors[day] || "transparent";
        row.innerHTML = `
            <td>${item.faculty}</td>
            <td>${item.subject}</td>
            <td>${item.type}</td>
            <td>${item.slot}</td>
        `;
        tableBody.appendChild(row);
    });

    enableTableSort();
}

/* ============================
   8. TABLE SORTING
============================ */
function enableTableSort(){
    const table = document.getElementById("gaScheduleTable");
    const headers = table.querySelectorAll("th");
    const dayOrder = {Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5};

    headers.forEach(header=>{
        header.onclick = ()=>{
            const key = header.dataset.key;
            if(lastSort.key === key) lastSort.ascending = !lastSort.ascending;
            else { lastSort.key = key; lastSort.ascending = true; }

            const tbody = table.querySelector("tbody");
            const rows = Array.from(tbody.querySelectorAll("tr"));

            rows.sort((a,b)=>{
                let valA = a.children[header.cellIndex].textContent.trim();
                let valB = b.children[header.cellIndex].textContent.trim();

                if(key === "slot"){
                    const parseSlot = slot => {
                        const [dayPart, timePart] = slot.split(':');
                        const day = dayPart.trim();
                        const unit = parseInt(timePart.split('-')[0].trim());
                        return { day, unit };
                    };
                    const sA=parseSlot(valA), sB=parseSlot(valB);
                    const dayDiff = dayOrder[sA.day]-dayOrder[sB.day];
                    if(dayDiff!==0) return dayDiff*(lastSort.ascending?1:-1);
                    return (sA.unit-sB.unit)*(lastSort.ascending?1:-1);
                }

                if(!isNaN(valA) && !isNaN(valB)) return (valA-valB)*(lastSort.ascending?1:-1);
                return valA.localeCompare(valB)*(lastSort.ascending?1:-1);
            });

            tbody.innerHTML = "";
            rows.forEach(r=>tbody.appendChild(r));

            headers.forEach(h=>{ h.querySelector(".sort-arrow").innerHTML="&#9650;"; });
            header.querySelector(".sort-arrow").innerHTML = lastSort.ascending?"&#9650;":"&#9660;";
        };
    });
}


/* ====================================================FACULTY EDITS ======================================================= */

// Initial faculty data from website
const initialFaculties = [
    {"name": "Rodriguez", "specialization": ["Cybersecurity / Information Assurance"], "max_units": 24, "absolute_max_units": 30, "availability": ["Mon","Tue","Wed","Thu","Fri","Sat"]},
    {"name": "Arelliano", "specialization": ["Systems Architecture / Enterprise Systems"], "max_units": 24, "absolute_max_units": 30, "availability": ["Mon","Tue","Wed","Thu","Fri","Sat"]},
    {"name": "Taganas", "specialization": ["Software Engineering / Programming Languages"], "max_units": 24, "absolute_max_units": 30, "availability": ["Mon","Tue","Wed","Thu","Fri","Sat"]},
    {"name": "Flores", "specialization": ["Data Science / Applied Mathematics"], "max_units": 24, "absolute_max_units": 30, "availability": ["Mon","Tue","Wed","Thu","Fri","Sat"]},
    {"name": "Castillo", "specialization": ["Computer Networks / Network Engineering"], "max_units": 24, "absolute_max_units": 30, "availability": ["Mon","Tue","Wed","Thu","Fri","Sat"]},
    {"name": "Bravo", "specialization": ["Emerging Technologies / Application Development"], "max_units": 24, "absolute_max_units": 30, "availability": ["Mon","Tue","Wed","Thu","Fri","Sat"]},
    {"name": "Villanueva", "specialization": ["Software Engineering / Systems Integration"], "max_units": 24, "absolute_max_units": 30, "availability": ["Mon","Tue","Wed","Thu","Fri","Sat"]},
    {"name": "Ampongan", "specialization": ["Information Systems / Database Management"], "max_units": 24, "absolute_max_units": 30, "availability": ["Mon","Tue","Wed","Thu","Fri","Sat"]},
    {"name": "Pontillas", "specialization": ["Human-Computer Interaction (HCI)"], "max_units": 24, "absolute_max_units": 30, "availability": ["Mon","Tue","Wed","Thu","Fri","Sat"]},
    {"name": "Aquino", "specialization": ["Database Systems / Information Systems"], "max_units": 24, "absolute_max_units": 30, "availability": ["Mon","Tue","Wed","Thu","Fri","Sat"]}
];

function getFacultyFromTable() {
  const rows = document.querySelectorAll("#facultyInputTable tbody tr");
  const facultyList = [];

  rows.forEach(row => {
    const name = row.querySelector("td:nth-child(1) input").value;
    const specialization = Array.from(row.querySelectorAll("td:nth-child(2) input[type=checkbox]:checked")).map(cb => cb.value);
    const absolute_max_units = parseInt(row.querySelector("td:nth-child(3) input").value);
    
    const availability = [];
    row.querySelectorAll("td:nth-child(4) input[type=checkbox]").forEach(cb => {
      if(cb.checked){
        // Map back to short day keys
        for (let key in dayMap) {
          if(dayMap[key] === cb.value){
            availability.push(key);
          }
        }
      }
    });

    if(name && specialization.length > 0){
      facultyList.push({
        name,
        specialization, // now ARRAY
        max_units: parseInt(row.querySelector("td:nth-child(3) input").value),
        absolute_max_units,
        availability
      });
    }
  });

  return facultyList;
}

async function startGA(population, generations, mutation, crossover) {

function expandSubjects(subjects){
    return subjects.map(sub => ({
        name: sub.name,
        type: sub.type,
        hours: (Number(sub.lec_units) || 0) + ((Number(sub.lab_units) || 0) * 3)
    }));
}

    // ✅ Get original subjects first
    let subjects = getSubjectsFromTable();

    // If table is empty, use defaultSubjects
    if (!subjects || subjects.length === 0) {
        subjects = defaultSubjects;
    }

    // ✅ Expand them
    const expandedSubjects = expandSubjects(subjects);

    const payload = {
        faculty: getFacultyFromTable(),
        subjects: expandedSubjects, // ✅ ONLY ONCE
        population: Number(population),
        generations: Number(generations),
        mutation: Number(mutation),
        crossover: Number(crossover)
    };

    console.log("Sending GA params:", payload);

    const response = await fetch("http://localhost:5000/run-ga", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log(data.status);
}


const dayMap = {
    Mon: "Monday",
    Tue: "Tuesday",
    Wed: "Wednesday",
    Thu: "Thursday",
    Fri: "Friday",
    Sat: "Saturday"
};


const specializations = [
  "Computer Science Education",
  "Software Engineering / Programming Languages",
  "Applied Mathematics / Theoretical Computer Science",
  "Human-Computer Interaction (HCI)",
  "Computer Graphics / Visual Computing",
  "Algorithms & Data Structures / Theoretical Computer Science",
  "Information Technology (General Elective)",
  "Data Science / Applied Mathematics",
  "Information Systems / Database Management",
  "Operations Research / Computational Modelling",
  "Computer Networks",
  "Software Engineering / Systems Integration",
  "Systems Architecture / Enterprise Systems",
  "Database Systems / Information Systems",
  "Computer Networks / Network Engineering",
  "Cybersecurity / Information Assurance",
  "Web Development / Web Technologies",
  "Multimedia Computing / Digital Media",
  "Emerging Technologies / Application Development",
  "Geographic Information Systems (GIS)",
  "Embedded Systems Engineering"
];

function addFacultyRow(facultyData = null) {
  const tbody = document.querySelector('#facultyInputTable tbody');
  const tr = document.createElement('tr');

  const nameValue = facultyData?.name || "";
  const specsSelected = facultyData?.specialization || [];
  const daysSelected = facultyData?.availability || [];

  tr.innerHTML = `
    <td><input type="text" placeholder="Enter Name" value="${nameValue}"></td>
    <td>
      <div class="multi-select-dropdown">
        <div class="dropdown-btn" onclick="toggleDropdown(this.parentElement)">
          ${specsSelected.length ? specsSelected.join(', ') : 'Choose Specialization'}
        </div>
        <div class="dropdown-content" style="display: none;">
          ${specializations.map(spec => `
            <label>
              <input type="checkbox" value="${spec}" ${specsSelected.includes(spec) ? "checked" : ""}> ${spec}
            </label>
          `).join('')}
          <div style="margin-top: 5px; text-align: right;">
            <button type="button" onclick="confirmSelection(this.closest('.multi-select-dropdown'))">OK</button>
          </div>
        </div>
      </div>
    </td>
    <td><input type="number" value="${facultyData?.absolute_max_units || 30}" readonly></td>
    <td>
      <div>
        <label><input type="checkbox" value="Monday" ${daysSelected.map(d=>dayMap[d]).includes("Monday") ? "checked" : ""}>Mon</label>
        <label><input type="checkbox" value="Tuesday" ${daysSelected.map(d=>dayMap[d]).includes("Tuesday") ? "checked" : ""}>Tue</label>
        <label><input type="checkbox" value="Wednesday" ${daysSelected.map(d=>dayMap[d]).includes("Wednesday") ? "checked" : ""}>Wed</label>
        <label><input type="checkbox" value="Thursday" ${daysSelected.map(d=>dayMap[d]).includes("Thursday") ? "checked" : ""}>Thu</label>
        <label><input type="checkbox" value="Friday" ${daysSelected.map(d=>dayMap[d]).includes("Friday") ? "checked" : ""}>Fri</label>
        <label><input type="checkbox" value="Saturday" ${daysSelected.map(d=>dayMap[d]).includes("Saturday") ? "checked" : ""}>Sat</label>
      </div>
    </td>
    <td><button onclick="removeFacultyRow(this)">Remove</button></td>
  `;

  tbody.appendChild(tr);
  saveFacultyToStorage();
}

window.addEventListener('DOMContentLoaded', () => {
    const saved = loadFacultyFromStorage();

    if (saved && saved.length > 0) {
        saved.forEach(faculty => addFacultyRow(faculty));
    } else {
        initialFaculties.forEach(faculty => addFacultyRow(faculty));
    }

    // ===== SUBJECT INIT =====
    const savedSubjects = loadSubjects();

    if(savedSubjects && savedSubjects.length > 0){
        savedSubjects.forEach(s => addSubjectRow(s));
    } else {
        defaultSubjects.forEach(s => addSubjectRow(s));
    }

    renderSubjects();
});


// Remove a faculty row
function removeFacultyRow(btn) {
  btn.closest('tr').remove();
}

// Toggle dropdown visibility on click
function toggleDropdown(dropdown) {
  const content = dropdown.querySelector('.dropdown-content');
  content.style.display = content.style.display === 'block' ? 'none' : 'block';
}

// Confirm selection and collapse dropdown
function confirmSelection(dropdown) {
  const selected = Array.from(dropdown.querySelectorAll('input[type="checkbox"]:checked'))
                        .map(cb => cb.value);

  dropdown.querySelector('.dropdown-btn').textContent = selected.length ? selected.join(', ') : 'Choose Specializations';
  dropdown.querySelector('.dropdown-content').style.display = 'none';
  saveFacultyToStorage();
}

function removeFacultyRow(btn) {
  btn.closest('tr').remove();
  saveFacultyToStorage();
}

// Initialize Add button
document.getElementById('addFacultyRow').addEventListener('click', addFacultyRow);

function saveFacultyToStorage() {
    const faculty = getFacultyFromTable();
    localStorage.setItem("facultyData", JSON.stringify(faculty));
}

function loadFacultyFromStorage() {
    const data = localStorage.getItem("facultyData");
    if (!data) return null;
    return JSON.parse(data);
}

document.addEventListener("input", (e) => {
    if (e.target.closest("#facultyInputTable")) {
        saveFacultyToStorage();
    }
});

document.addEventListener("change", (e) => {
    if (e.target.closest("#facultyInputTable")) {
        saveFacultyToStorage();
    }
});

/* ==================================================== SUBJECTS ======================================================= */

/* ================= DEFAULT SUBJECTS ================= */


const defaultSubjects = [

  // ===== 1ST YEAR - 1ST SEM =====
  { name: "Introduction to Computing", type: "Software", year: "1st Year", semester: "1st Semester", lec_units: 2, lab_units: 1 },
  { name: "Computer Programming 1", type: "Software", year: "1st Year", semester: "1st Semester", lec_units: 2, lab_units: 1 },

  // ===== 1ST YEAR - 2ND SEM =====
  { name: "Discrete Mathematics", type: "Software", year: "1st Year", semester: "2nd Semester", lec_units: 3, lab_units: 0 },
  { name: "Introduction to Human Computer Interaction", type: "Software", year: "1st Year", semester: "2nd Semester", lec_units: 2, lab_units: 1 },
  { name: "Computer Programming 2", type: "Software", year: "1st Year", semester: "2nd Semester", lec_units: 2, lab_units: 1 },

  // ===== 2ND YEAR - 1ST SEM =====
  { name: "Graphics and Visual Computing", type: "Software", year: "2nd Year", semester: "1st Semester", lec_units: 2, lab_units: 1 },
  { name: "Data Structures and Algorithms", type: "Software", year: "2nd Year", semester: "1st Semester", lec_units: 2, lab_units: 1 },
  { name: "IT Elective 1", type: "Elective", year: "2nd Year", semester: "1st Semester", lec_units: 2, lab_units: 1 },
  { name: "IT Elective 2", type: "Elective", year: "2nd Year", semester: "1st Semester", lec_units: 2, lab_units: 0 },

  // ===== 2ND YEAR - 2ND SEM =====
  { name: "Mathematics for Data Science", type: "Software", year: "2nd Year", semester: "2nd Semester", lec_units: 3, lab_units: 0 },
  { name: "Information Management 1", type: "Database", year: "2nd Year", semester: "2nd Semester", lec_units: 2, lab_units: 1 },
  { name: "Quantitative Methods w/ Modelling and Simulation", type: "Software", year: "2nd Year", semester: "2nd Semester", lec_units: 3, lab_units: 0 },
  { name: "Network Technologies 1", type: "Networking", year: "2nd Year", semester: "2nd Semester", lec_units: 2, lab_units: 1 },
  { name: "Integrative Programming Technologies 1", type: "Software", year: "2nd Year", semester: "2nd Semester", lec_units: 2, lab_units: 1 },
  { name: "Systems Integration and Architecture 1", type: "Software", year: "2nd Year", semester: "2nd Semester", lec_units: 3, lab_units: 0 },

  // ===== 3RD YEAR - 1ST SEM =====
  { name: "Advanced Database Systems", type: "Database", year: "3rd Year", semester: "1st Semester", lec_units: 2, lab_units: 1 },
  { name: "Network Technologies 2", type: "Networking", year: "3rd Year", semester: "1st Semester", lec_units: 2, lab_units: 1 },
  { name: "Information Assurance and Security 1", type: "Software", year: "3rd Year", semester: "1st Semester", lec_units: 2, lab_units: 0 },
  { name: "Web Systems and Technologies 1", type: "Software", year: "3rd Year", semester: "1st Semester", lec_units: 2, lab_units: 1 },
  { name: "Multimedia Systems", type: "Software", year: "3rd Year", semester: "1st Semester", lec_units: 2, lab_units: 1 },
  { name: "IT Elective 3", type: "Elective", year: "3rd Year", semester: "1st Semester", lec_units: 2, lab_units: 0 },

  // ===== 3RD YEAR - 2ND SEM =====
  { name: "Application Development and Emerging Technologies 1", type: "Software", year: "3rd Year", semester: "2nd Semester", lec_units: 2, lab_units: 1 },
  { name: "Geographic Information System", type: "Software", year: "3rd Year", semester: "2nd Semester", lec_units: 2, lab_units: 1 },
  { name: "Embedded System", type: "Software", year: "3rd Year", semester: "2nd Semester", lec_units: 2, lab_units: 1 },
  { name: "Information Assurance and Security 2", type: "Software", year: "3rd Year", semester: "2nd Semester", lec_units: 2, lab_units: 0 }

];
/* ================= SUBJECT SYSTEM ================= */

function computeHours(lec, lab){
    return (lec * 1) + (lab * 3);
}

function addSubjectRow(subject = {}) {
  const row = document.createElement("tr");

  row.innerHTML = `
    <td>
      <select class="subject-year">
        <option value="1st Year">1st Year</option>
        <option value="2nd Year">2nd Year</option>
        <option value="3rd Year">3rd Year</option>
      </select>
    </td>

    <td>
      <select class="subject-semester">
        <option value="1st Semester">1st Semester</option>
        <option value="2nd Semester">2nd Semester</option>
      </select>
    </td>

    <td>
      <input type="text" class="subject-name" />
    </td>

    <td>
      <select class="subject-type">
        <option value="Software">Software</option>
        <option value="Database">Database</option>
        <option value="Networking">Networking</option>
        <option value="Elective">Elective</option>
      </select>
    </td>

    <td>
      <input type="number" class="lec" min="0" />
    </td>

    <td>
      <input type="number" class="lab" min="0" />
    </td>

    <td class="total-hours">0</td>

    <td>
      <button class="delete-btn">Delete</button>
    </td>
  `;

  // Get elements
  const yearSelect = row.querySelector(".subject-year");
  const semSelect = row.querySelector(".subject-semester");
  const nameInput = row.querySelector(".subject-name");
  const typeSelect = row.querySelector(".subject-type");
  const lecInput = row.querySelector(".lec");
  const labInput = row.querySelector(".lab");
  const totalCell = row.querySelector(".total-hours");
  const deleteBtn = row.querySelector(".delete-btn");

  // =========================
  // 🔥 CONNECT YOUR DATA HERE
  // =========================
  yearSelect.value = subject.year || "1st Year";
  semSelect.value = subject.semester || "1st Semester";
  nameInput.value = subject.name || "";
  typeSelect.value = subject.type || "Software";
  lecInput.value = subject.lec_units ?? 0;
  labInput.value = subject.lab_units ?? 0;

  // =========================
  // 🔥 CALCULATE TOTAL HOURS
  // =========================
  function updateTotal() {
    const lec = parseInt(lecInput.value) || 0;
    const lab = parseInt(labInput.value) || 0;
    totalCell.textContent = lec + lab;
  }

  lecInput.addEventListener("input", updateTotal);
  labInput.addEventListener("input", updateTotal);

  updateTotal(); // initial calculation

  // =========================
  // 🔥 DELETE BUTTON
  // =========================
  deleteBtn.addEventListener("click", () => {
    row.remove();
  });

  // =========================
  // 🔥 APPEND ROW
  // =========================
  document.querySelector("#subjectsTable tbody").appendChild(row);
}

function updateRowTotal(row){
    const lec = parseInt(row.querySelector(".lec").value) || 0;
    const lab = parseInt(row.querySelector(".lab").value) || 0;

    const total = computeHours(lec, lab);
    row.querySelector(".total").textContent = total;
}

function getSubjectsFromTable(){
    const rows = document.querySelectorAll("#subjectsTable tbody tr");

    return Array.from(rows).map(row => {
        return {
            year: row.querySelector(".subject-year").value,
            semester: row.querySelector(".subject-semester").value,
            name: row.querySelector(".subject-name").value,
            type: row.querySelector(".subject-type").value,
            lec_units: Number(row.querySelector(".lec").value),
            lab_units: Number(row.querySelector(".lab").value),
            hours: (Number(row.querySelector(".lec").value) * 1) + 
                   (Number(row.querySelector(".lab").value) * 3)
        };
    });
}

function saveSubjects(){
    localStorage.setItem("subjectsData", JSON.stringify(getSubjectsFromTable()));
}

function loadSubjects(){
    return JSON.parse(localStorage.getItem("subjectsData")) || null;
}

document.addEventListener("input", (e) => {
    if(e.target.classList.contains("lec") || e.target.classList.contains("lab")){
        const row = e.target.closest("tr");
        updateRowTotal(row);
        saveSubjects();
    }
});

document.getElementById("addSubjectRow")
    .addEventListener("click", () => addSubjectRow());

function groupSubjects(subjects){
    const grouped = {};

    subjects.forEach(sub => {

        const key = `${sub.year} - ${sub.semester}`;

        if(!grouped[key]){
            grouped[key] = [];
        }

        grouped[key].push(sub);

    });

    return grouped;
}

function renderSubjects(){
    const subjects = getSubjectsFromTable().length 
    ? getSubjectsFromTable() 
    : defaultSubjects;
    const grouped = groupSubjects(subjects);

    const container = document.getElementById("subjectsContainer");
    container.innerHTML = "";

    for(let key in grouped){

        const section = document.createElement("div");

        section.innerHTML = `
            <h3>${key}</h3>
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Lec</th>
                        <th>Lab</th>
                    </tr>
                </thead>
                <tbody>
                    ${grouped[key].map(sub => `
                        <tr>
                            <td>${sub.name}</td>
                            <td>${sub.type}</td>
                            <td>${sub.lec_units}</td>
                            <td>${sub.lab_units}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;

        container.appendChild(section);
    }
}

function loadDefaultSubjectsIntoTable() {
    defaultSubjects.forEach(sub => {
        addSubjectRow(sub);
    });
}
