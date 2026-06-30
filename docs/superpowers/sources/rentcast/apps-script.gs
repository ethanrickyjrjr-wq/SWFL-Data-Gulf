/**
 * RentCast Daily/Weekly Pull -> Google Sheet
 * -------------------------------------------------
 * SETUP (one-time):
 * 1. Open script.google.com (or Extensions > Apps Script from inside your Sheet)
 * 2. Paste this whole file in, replacing everything that was there before.
 * 3. Reload the Google Sheet tab (close and reopen it) so the new
 *    "RentCast Tools" menu appears next to Help.
 * 4. Click RentCast Tools > Set API Key, paste your RentCast key.
 * 5. Click RentCast Tools > Set Refresh Schedule, answer the prompts
 *    (daily or weekly, what time, and an email for notifications).
 * 6. Click RentCast Tools > Refresh Now once to do the first pull.
 *
 * IMPORTANT: If you already had data in the "RentCast Listings" tab from
 * an older version of this script, run RentCast Tools > Reset Sheet Data
 * once first. The column layout changed (added a State column + a
 * dashboard row at the top), and old rows won't line up with the new
 * columns otherwise -- this is what was causing the coloring to look wrong.
 */

const TARGET_CITIES = [
  // Lee County
  { city: "Fort Myers", state: "FL" },
  { city: "Cape Coral", state: "FL" },
  { city: "Bonita Springs", state: "FL" },
  { city: "Estero", state: "FL" },
  { city: "Fort Myers Beach", state: "FL" },
  { city: "Sanibel", state: "FL" },
  { city: "North Fort Myers", state: "FL" },
  { city: "Lehigh Acres", state: "FL" },

  // Collier County
  { city: "Naples", state: "FL" },
  { city: "Marco Island", state: "FL" },
  { city: "Immokalee", state: "FL" },
  { city: "Golden Gate", state: "FL" },
  { city: "Ave Maria", state: "FL" },

  // Charlotte County
  { city: "Punta Gorda", state: "FL" },
  { city: "Port Charlotte", state: "FL" },
  { city: "Rotonda West", state: "FL" },
  { city: "Englewood", state: "FL" },          // straddles Charlotte/Sarasota

  // Sarasota County
  { city: "Sarasota", state: "FL" },
  { city: "Venice", state: "FL" },
  { city: "North Port", state: "FL" },
  { city: "Nokomis", state: "FL" },
  { city: "Siesta Key", state: "FL" }
];

const SHEET_NAME = "RentCast Listings";
const BASE_URL = "https://api.rentcast.io/v1/listings/sale";

// Color coding:
// Green  = newly listed today        (Listed Date cell)
// Yellow = price cut since last pull (Price cell)
// Red    = sold / removed (Inactive) (Status cell)
const COLOR_NEW = "#b6d7a8";       // green
const COLOR_PRICE_CUT = "#ffe599"; // yellow
const COLOR_SOLD = "#ea9999";      // red

// Data table column positions (1-indexed), header lives on row 2,
// data starts row 3. Row 1 is the dashboard (schedule/timer) row.
const COL_PULL_DATE = 1, COL_CITY = 2, COL_STATE = 3, COL_STATUS = 4,
      COL_ADDRESS = 5, COL_PRICE = 6, COL_DOM = 7, COL_LISTED = 8,
      COL_REMOVED = 9, COL_MLS = 10;
const HEADER_ROW = 2;
const FIRST_DATA_ROW = 3;

// ============================================================
// MENU
// ============================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("RentCast Tools")
    .addItem("Refresh Now", "pullRentCastListings")
    .addItem("Set Refresh Schedule", "promptSetSchedule")
    .addItem("Set API Key", "promptForApiKey")
    .addItem("Get Rent Estimate for an Address", "promptRentEstimate")
    .addSeparator()
    .addItem("Reset Sheet Data", "resetSheetData")
    .addToUi();
}

function promptForApiKey() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    "Set RentCast API Key",
    "Paste your RentCast API key below:",
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  const key = response.getResponseText().trim();
  if (key.length < 10) {
    ui.alert("That doesn't look like a valid key (too short). Nothing was saved.");
    return;
  }

  PropertiesService.getScriptProperties().setProperty("RENTCAST_API_KEY", key);
  ui.alert("API key saved successfully.");
}

// ============================================================
// SCHEDULING (asks frequency + time + notification email)
// ============================================================

function promptSetSchedule() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();

  // 1. Frequency
  const freqResp = ui.prompt(
    "Refresh Schedule (1/3)",
    "Type 'daily' or 'weekly':",
    ui.ButtonSet.OK_CANCEL
  );
  if (freqResp.getSelectedButton() !== ui.Button.OK) return;
  const frequency = freqResp.getResponseText().trim().toLowerCase();
  if (frequency !== "daily" && frequency !== "weekly") {
    ui.alert("Please type exactly 'daily' or 'weekly'. Nothing was changed.");
    return;
  }

  // 2. Weekday (only if weekly)
  let weekday = "";
  if (frequency === "weekly") {
    const dayResp = ui.prompt(
      "Refresh Schedule (2/3)",
      "Which day of the week? (Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday)",
      ui.ButtonSet.OK_CANCEL
    );
    if (dayResp.getSelectedButton() !== ui.Button.OK) return;
    weekday = dayResp.getResponseText().trim();
    if (!ScriptApp.WeekDay[weekday.toUpperCase()]) {
      ui.alert("Didn't recognize that day. Please type a full day name like 'Monday'. Nothing was changed.");
      return;
    }
  }

  // 3. Hour
  const hourResp = ui.prompt(
    "Refresh Schedule (" + (frequency === "weekly" ? "3/4" : "2/3") + ")",
    "What hour should it run? Enter 0-23 (e.g. 6 = 6 AM, 14 = 2 PM). Uses this script's timezone.",
    ui.ButtonSet.OK_CANCEL
  );
  if (hourResp.getSelectedButton() !== ui.Button.OK) return;
  const hour = parseInt(hourResp.getResponseText().trim(), 10);
  if (isNaN(hour) || hour < 0 || hour > 23) {
    ui.alert("That's not a valid hour (0-23). Nothing was changed.");
    return;
  }

  // 4. Notification email
  const emailResp = ui.prompt(
    "Refresh Schedule (last step)",
    "Email address for refresh notifications (leave blank to skip emails):",
    ui.ButtonSet.OK_CANCEL
  );
  if (emailResp.getSelectedButton() !== ui.Button.OK) return;
  const email = emailResp.getResponseText().trim();

  // Save settings
  props.setProperty("SCHEDULE_FREQUENCY", frequency);
  props.setProperty("SCHEDULE_HOUR", String(hour));
  props.setProperty("SCHEDULE_WEEKDAY", weekday);
  props.setProperty("NOTIFY_EMAIL", email);

  // Remove old triggers for this function, then create the new one
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "pullRentCastListings") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  if (frequency === "daily") {
    ScriptApp.newTrigger("pullRentCastListings")
      .timeBased()
      .everyDays(1)
      .atHour(hour)
      .nearMinute(0)
      .create();
  } else {
    ScriptApp.newTrigger("pullRentCastListings")
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay[weekday.toUpperCase()])
      .atHour(hour)
      .nearMinute(0)
      .create();
  }

  updateDashboard(); // refresh the schedule/next-run display immediately

  ui.alert(
    "Schedule set: " + frequency +
    (weekday ? " on " + weekday : "") +
    " around " + hour + ":00" +
    (email ? ". Notifications will go to " + email + "." : ". No email notifications set.")
  );
}

/**
 * Calculates the next run time as a JS Date, based on saved schedule
 * settings. This is an ESTIMATE for display purposes -- Apps Script
 * time-based triggers fire within roughly a 15-30 min window of the
 * requested time, not to the exact minute.
 */
function calculateNextRunEstimate() {
  const props = PropertiesService.getScriptProperties();
  const frequency = props.getProperty("SCHEDULE_FREQUENCY");
  const hour = parseInt(props.getProperty("SCHEDULE_HOUR"), 10);
  const weekday = props.getProperty("SCHEDULE_WEEKDAY");

  if (!frequency || isNaN(hour)) return null;

  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);

  if (frequency === "daily") {
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }

  // weekly
  const dayMap = { SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6 };
  const targetDay = dayMap[weekday.toUpperCase()];
  if (targetDay === undefined) return null;

  let daysAhead = (targetDay - next.getDay() + 7) % 7;
  if (daysAhead === 0 && next <= now) daysAhead = 7;
  next.setDate(next.getDate() + daysAhead);
  return next;
}

// ============================================================
// MAIN PULL
// ============================================================

function pullRentCastListings() {
  const apiKey = PropertiesService.getScriptProperties().getProperty("RENTCAST_API_KEY");
  if (!apiKey) {
    throw new Error("Missing RENTCAST_API_KEY in Script Properties. Use RentCast Tools > Set API Key.");
  }

  const sheet = getOrCreateSheet();
  const today = new Date().toISOString().split("T")[0];

  const priceHistory = buildPriceHistory(sheet);
  let totalRows = 0;

  TARGET_CITIES.forEach(function (target) {
    ["Active", "Inactive"].forEach(function (status) {
      const listings = fetchListings(target.city, target.state, status, apiKey, today);
      listings.forEach(function (listing) {
        const rowIndex = appendListingRow(sheet, listing);
        colorRow(sheet, rowIndex, listing, today, priceHistory);
        if (listing.mlsNumber) priceHistory[listing.mlsNumber] = listing.price;
        totalRows++;
      });
    });
  });

  Logger.log("Pull complete: " + totalRows + " rows added on " + today);

  updateDashboard(totalRows);
  sendRefreshEmail(totalRows, today);
}

function buildPriceHistory(sheet) {
  const history = {};
  const lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) return history;

  const data = sheet.getRange(FIRST_DATA_ROW, 1, lastRow - FIRST_DATA_ROW + 1, COL_MLS).getValues();
  data.forEach(function (row) {
    const price = row[COL_PRICE - 1];
    const mls = row[COL_MLS - 1];
    if (mls) history[mls] = price;
  });

  return history;
}

function appendListingRow(sheet, listing) {
  sheet.appendRow([
    listing.pullDate, listing.city, listing.state, listing.status,
    listing.address, listing.price, listing.daysOnMarket,
    listing.listedDate, listing.removedDate, listing.mlsNumber
  ]);
  return sheet.getLastRow();
}

function colorRow(sheet, rowIndex, listing, today, priceHistory) {
  // Explicitly clear these three cells FIRST, every time. Without this,
  // Google Sheets sometimes auto-extends the formatting of the row above
  // onto newly appended rows -- which is why Active rows were showing up
  // red even though the code never told them to.
  sheet.getRange(rowIndex, COL_STATUS).setBackground(null);
  sheet.getRange(rowIndex, COL_LISTED).setBackground(null);
  sheet.getRange(rowIndex, COL_PRICE).setBackground(null);

  if (listing.status === "Inactive") {
    sheet.getRange(rowIndex, COL_STATUS).setBackground(COLOR_SOLD);
  }

  if (listing.listedDate && listing.listedDate.indexOf(today) === 0) {
    sheet.getRange(rowIndex, COL_LISTED).setBackground(COLOR_NEW);
  }

  if (listing.mlsNumber && priceHistory.hasOwnProperty(listing.mlsNumber)) {
    const previousPrice = Number(priceHistory[listing.mlsNumber]);
    const currentPrice = Number(listing.price);
    if (!isNaN(previousPrice) && !isNaN(currentPrice) && currentPrice < previousPrice) {
      sheet.getRange(rowIndex, COL_PRICE).setBackground(COLOR_PRICE_CUT);
    }
  }
}

function fetchListings(city, state, status, apiKey, today) {
  const url = BASE_URL
    + "?city=" + encodeURIComponent(city)
    + "&state=" + encodeURIComponent(state)
    + "&status=" + encodeURIComponent(status)
    + "&limit=500";

  const options = {
    method: "get",
    headers: { "X-Api-Key": apiKey, "accept": "application/json" },
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();

  if (code !== 200) {
    Logger.log("Failed for " + city + " (" + status + "): HTTP " + code + " - " + response.getContentText());
    return [];
  }

  const data = JSON.parse(response.getContentText());

  return data.map(function (listing) {
    return {
      pullDate: today,
      city: city,
      state: state,
      status: status,
      address: listing.formattedAddress || "",
      price: listing.price || "",
      daysOnMarket: listing.daysOnMarket || "",
      listedDate: listing.listedDate || "",
      removedDate: listing.removedDate || "",
      mlsNumber: listing.mlsNumber || ""
    };
  });
}

// ============================================================
// SHEET LAYOUT: row 1 = dashboard, row 2 = headers, row 3+ = data
// ============================================================

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);

    // Row 1: dashboard placeholders (filled in by updateDashboard)
    sheet.getRange("A1").setValue("Schedule:");
    sheet.getRange("C1").setValue("Last Refresh:");
    sheet.getRange("E1").setValue("Next Refresh:");
    sheet.getRange("G1").setValue("Time Remaining:");
    sheet.getRange("A1:H1").setFontWeight("bold");

    // Row 2: column headers
    sheet.getRange(HEADER_ROW, 1, 1, 10).setValues([[
      "Pull Date", "City", "State", "Status", "Address", "Price",
      "Days On Market", "Listed Date", "Removed Date", "MLS Number"
    ]]);

    sheet.setFrozenRows(2);
  }

  // Legend notes on header row (row 2), re-applied every run so older
  // sheets also get them.
  sheet.getRange(HEADER_ROW, COL_STATUS).setNote("Red background = Sold / removed from market");
  sheet.getRange(HEADER_ROW, COL_PRICE).setNote("Yellow background = Price cut since last pull");
  sheet.getRange(HEADER_ROW, COL_LISTED).setNote("Green background = Listed today");

  return sheet;
}

/**
 * Refreshes the dashboard row (schedule description, last refresh time,
 * next refresh estimate, and a live-updating countdown formula).
 */
function updateDashboard(rowsAddedThisRun) {
  const sheet = getOrCreateSheet();
  const props = PropertiesService.getScriptProperties();

  const frequency = props.getProperty("SCHEDULE_FREQUENCY");
  const hour = props.getProperty("SCHEDULE_HOUR");
  const weekday = props.getProperty("SCHEDULE_WEEKDAY");

  let scheduleText = "Not set yet -- use RentCast Tools > Set Refresh Schedule";
  if (frequency === "daily") {
    scheduleText = "Daily around " + hour + ":00";
  } else if (frequency === "weekly") {
    scheduleText = "Weekly on " + weekday + " around " + hour + ":00";
  }
  sheet.getRange("B1").setValue(scheduleText);

  if (rowsAddedThisRun !== undefined) {
    sheet.getRange("D1").setValue(new Date());
    sheet.getRange("D1").setNumberFormat("yyyy-mm-dd hh:mm");
  }

  const nextRun = calculateNextRunEstimate();
  if (nextRun) {
    sheet.getRange("F1").setValue(nextRun);
    sheet.getRange("F1").setNumberFormat("yyyy-mm-dd hh:mm");
    // Live countdown formula: recalculates whenever the sheet recalculates.
    // For it to tick down continuously (not just on edit), set:
    //   File > Settings > Calculation > Recalculation: "On change and every minute"
    sheet.getRange("H1").setFormula("=F1-NOW()");
    sheet.getRange("H1").setNumberFormat("[h]:mm:ss");
  } else {
    sheet.getRange("F1").setValue("--");
    sheet.getRange("H1").setValue("--");
  }
}

/**
 * Sends a confirmation email after a successful refresh, if a
 * notification email has been set via the schedule prompt.
 */
function sendRefreshEmail(rowsAdded, today) {
  const email = PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAIL");
  if (!email) return;

  try {
    MailApp.sendEmail(
      email,
      "RentCast pipeline refreshed -- " + today,
      "Your RentCast listings sheet just refreshed.\n\n" +
      "Rows added: " + rowsAdded + "\n" +
      "Date: " + today + "\n\n" +
      "Open the sheet to review new listings, price cuts, and sold/removed properties (color-coded)."
    );
  } catch (e) {
    Logger.log("Email notification failed: " + e);
  }
}

/**
 * Clears all data rows (keeps dashboard + headers). Use this once after
 * upgrading from an older version of the script that had a different
 * column layout, so old and new rows don't end up misaligned.
 */
function resetSheetData() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    "Reset Sheet Data",
    "This will permanently delete all listing rows in the 'RentCast Listings' tab " +
    "(dashboard and headers are kept). Continue?",
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  const sheet = getOrCreateSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow >= FIRST_DATA_ROW) {
    sheet.getRange(FIRST_DATA_ROW, 1, lastRow - FIRST_DATA_ROW + 1, 10).clear();
  }
  ui.alert("Sheet data cleared. Run Refresh Now to start fresh.");
}

/**
 * DEBUG ONLY -- run manually to confirm what's actually stored in
 * Script Properties. Delete once everything is confirmed working.
 */
function debugListScriptProperties() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const keys = Object.keys(props);

  if (keys.length === 0) {
    Logger.log("No script properties saved yet.");
    return;
  }

  keys.forEach(function (key) {
    const value = String(props[key]);
    const masked = value.length > 6 ? value.slice(0, 3) + "..." + value.slice(-3) : value;
    Logger.log("[" + key + "] -> " + masked);
  });
}

// ============================================================
// RENT ESTIMATE + COMPARABLES (on-demand, per address)
// This is a DIFFERENT RentCast endpoint than the daily city pull above.
// It needs one specific address each time, so it's run on demand
// instead of looping over every listing automatically -- doing that
// for every row in the main sheet would multiply API usage massively.
// ============================================================

const RENT_ESTIMATE_SHEET_NAME = "Rent Comparables";
const RENT_ESTIMATE_URL = "https://api.rentcast.io/v1/avm/rent/long-term";

function promptRentEstimate() {
  const ui = SpreadsheetApp.getUi();
  const apiKey = PropertiesService.getScriptProperties().getProperty("RENTCAST_API_KEY");
  if (!apiKey) {
    ui.alert("Missing API key. Use RentCast Tools > Set API Key first.");
    return;
  }

  const resp = ui.prompt(
    "Get Rent Estimate",
    "Enter the full property address (e.g. 4810 Pelican Colony Blvd, Unit 1004, Bonita Springs, FL 34134):",
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const address = resp.getResponseText().trim();
  if (!address) {
    ui.alert("No address entered.");
    return;
  }

  const url = RENT_ESTIMATE_URL + "?address=" + encodeURIComponent(address);
  const options = {
    method: "get",
    headers: { "X-Api-Key": apiKey, "accept": "application/json" },
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();

  if (code !== 200) {
    ui.alert("Request failed (HTTP " + code + "). Check the address and try again.\n\n" + response.getContentText());
    return;
  }

  const data = JSON.parse(response.getContentText());
  writeRentEstimateResults(address, data);
  ui.alert("Done. See the '" + RENT_ESTIMATE_SHEET_NAME + "' tab for the rent estimate and comparables.");
}

function writeRentEstimateResults(address, data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(RENT_ESTIMATE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(RENT_ESTIMATE_SHEET_NAME);
  }

  const today = new Date().toISOString().split("T")[0];

  // Leave a blank row between previous lookups, then write a header
  // block for this specific address lookup.
  if (sheet.getLastRow() > 0) {
    sheet.appendRow([]);
  }

  sheet.appendRow(["Subject Address:", address, "Pull Date:", today]);
  sheet.appendRow(["Rent Estimate:", data.rent || "N/A", "Range:", (data.rentRangeLow || "") + " - " + (data.rentRangeHigh || "")]);
  sheet.appendRow([]);
  sheet.appendRow(["Address", "Listed Rent", "Last Seen", "Similarity", "Distance (mi)", "Beds", "Baths", "Sq Ft", "Type"]);

  const comps = data.comparables || [];
  comps.forEach(function (comp) {
    sheet.appendRow([
      comp.formattedAddress || "",
      comp.price || "",
      comp.listedDate || comp.lastSeenDate || "",
      comp.correlation ? (Math.round(comp.correlation * 1000) / 10) + "%" : "",
      comp.distance || "",
      comp.bedrooms || "",
      comp.bathrooms || "",
      comp.squareFootage || "",
      comp.propertyType || ""
    ]);
  });

  // Bold the header rows we just added for readability
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow - comps.length - 3, 1, 2, 4).setFontWeight("bold");
  sheet.getRange(lastRow - comps.length, 1, 1, 9).setFontWeight("bold");
}
