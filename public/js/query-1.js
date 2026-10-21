(() => {
    const form = document.getElementById('rollup-run-form');
    const categoryInput = document.getElementById('queryCategoryInput');
    const categoryRadios = document.querySelectorAll('input[name="queryCategoryChoice"]');
    const resultsPanel = document.getElementById('results-panel');
    const loadingEl = document.getElementById('results-loading');
    const resultsHeading = document.getElementById('results-heading');
    const runBtn = document.getElementById('run-query-btn');

    if (!form || !resultsPanel) return;

    let selectedCategory =
        document.querySelector('input[name="queryCategoryChoice"]:checked')?.value || 'location';
    let locationLevel = resultsPanel.dataset.initialLevel || null;
    let periodLevel = resultsPanel.dataset.initialPeriodLevel || null;
    let activeRequest = 0;

    const periodHeadings = {
        quarter: 'Query results — Quarter level',
        month: 'Query results — Month level',
    };

    const setCategory = (value) => {
        selectedCategory = value;
        categoryInput.value = value;
        locationLevel = null;
        periodLevel = null;
        clearResultsForCategorySwitch();
    };

    categoryRadios.forEach((radio) => {
        radio.addEventListener('change', () => {
            if (radio.checked) setCategory(radio.value);
        });
    });

    form.addEventListener('submit', () => {
        const checked = document.querySelector('input[name="queryCategoryChoice"]:checked');
        if (checked) categoryInput.value = checked.value;
    });

    function clearResultsForCategorySwitch() {
        resultsPanel.innerHTML = `
          <div class="results-wrap empty-results" id="results-empty">
            <span class="empty-mark">∅</span>
            <strong>Query ready</strong>
            <p>Select a query type and click Run Query to load results from the warehouse.</p>
          </div>`;
        resultsHeading.textContent = 'Query results';
    }

    function setLoading(isLoading) {
        if (loadingEl) loadingEl.hidden = !isLoading;
        if (runBtn) runBtn.disabled = isLoading;
        resultsPanel.querySelectorAll('button').forEach((btn) => {
            btn.disabled = isLoading;
        });
    }

    function formatCell(col, val) {
        const isNum =
            col === 'number_of_transactions' ||
            (typeof val === 'number' && col !== 'year' && col !== 'day');
        const text = isNum ? Number(val).toLocaleString() : val;
        return `<td class="${isNum ? 'num' : ''}">${text}</td>`;
    }

    function buildPeriodFooter(level) {
        if (level === 'year') {
            return `<div class="olap-results-footer">
              <button type="button" class="olap-level-action" id="period-drill-year-btn">Drill-down Year->Quarter</button>
            </div>`;
        }
        if (level === 'quarter') {
            return `<div class="olap-results-footer olap-results-footer--split">
              <button type="button" class="olap-level-action" id="period-drill-quarter-btn">Drill-down Quarter->Month</button>
              <button type="button" class="olap-level-action" id="period-rollup-quarter-btn">Roll-up Quarter->Year</button>
            </div>`;
        }
        if (level === 'month') {
            return `<div class="olap-results-footer">
              <button type="button" class="olap-level-action" id="period-rollup-month-btn">Roll-up Month->Quarter</button>
            </div>`;
        }
        return '';
    }

    function buildLocationFooter(level) {
        if (level === 'region') {
            return `<div class="olap-results-footer">
              <button type="button" class="olap-level-action" id="location-drill-btn">Drill-Down Region->District</button>
            </div>`;
        }
        if (level === 'district') {
            return `<div class="olap-results-footer">
              <button type="button" class="olap-level-action" id="location-rollup-btn">Roll-Up District->Region</button>
            </div>`;
        }
        return '';
    }

    function renderTable(payload) {
        const { rows, columns, category, locationLevel: locLevel, periodLevel: perLevel } = payload;
        if (!rows || rows.length === 0) {
            resultsPanel.innerHTML = `
              <div class="results-wrap empty-results">
                <strong>No rows</strong>
                <p>The query returned no data.</p>
              </div>`;
            return;
        }

        const cols = columns?.length ? columns : Object.keys(rows[0]);
        if (category === 'period' && perLevel && periodHeadings[perLevel]) {
            resultsHeading.textContent = periodHeadings[perLevel];
        } else if (category === 'location' && locLevel === 'district') {
            resultsHeading.textContent = 'Query results — District level';
        } else {
            resultsHeading.textContent = 'Query results';
        }

        const head = cols
            .map(
                (c) =>
                    `<th class="${c === 'number_of_transactions' ? 'num' : ''}">${c.replace(/_/g, ' ')}</th>`
            )
            .join('');
        const body = rows
            .map((r) => `<tr>${cols.map((c) => formatCell(c, r[c])).join('')}</tr>`)
            .join('');

        let footer = '';
        if (category === 'location') footer = buildLocationFooter(locLevel);
        else if (category === 'period') footer = buildPeriodFooter(perLevel);

        resultsPanel.innerHTML = `
          <div class="results-wrap" id="results-table-wrap">
            <div class="results-scroll">
              <table class="results-table" id="results-table">
                <thead><tr>${head}</tr></thead>
                <tbody>${body}</tbody>
              </table>
            </div>
            ${footer}
          </div>`;

        bindActionButtons();
    }

    function showError(message) {
        resultsPanel.innerHTML = `
          <div class="results-wrap empty-results">
            <strong>Could not load results</strong>
            <p>${message}</p>
          </div>`;
    }

    async function runOperation(operation) {
        const requestId = ++activeRequest;
        setLoading(true);
        try {
            const res = await fetch('/api/rollup/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operation }),
            });
            const data = await res.json();
            if (requestId !== activeRequest) return;
            if (!res.ok) {
                showError(data.error || 'The query failed. Please try again.');
                return;
            }
            selectedCategory = data.category || selectedCategory;
            locationLevel = data.locationLevel ?? null;
            periodLevel = data.periodLevel ?? null;
            renderTable({
                rows: data.rows,
                columns: data.columns,
                category: data.category,
                locationLevel: data.locationLevel,
                periodLevel: data.periodLevel,
            });
        } catch {
            if (requestId !== activeRequest) return;
            showError('The query failed. Please try again.');
        } finally {
            if (requestId === activeRequest) setLoading(false);
        }
    }

    function bindActionButtons() {
        document.getElementById('location-drill-btn')?.addEventListener('click', () => {
            runOperation('drilldown_region_to_district');
        });
        document.getElementById('location-rollup-btn')?.addEventListener('click', () => {
            runOperation('rollup_by_region');
        });
        document.getElementById('period-drill-year-btn')?.addEventListener('click', () => {
            runOperation('drilldown_period_year_to_quarter');
        });
        document.getElementById('period-drill-quarter-btn')?.addEventListener('click', () => {
            runOperation('drilldown_period_quarter_to_month');
        });
        document.getElementById('period-rollup-quarter-btn')?.addEventListener('click', () => {
            runOperation('rollup_period_quarter_to_year');
        });
        document.getElementById('period-rollup-month-btn')?.addEventListener('click', () => {
            runOperation('rollup_period_month_to_quarter');
        });
    }

    bindActionButtons();
})();
