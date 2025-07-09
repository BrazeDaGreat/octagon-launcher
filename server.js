// Load environment variables first
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const path = require("path");
const fs = require("fs").promises;
const si = require("systeminformation");
const cron = require("node-cron");
const rateLimit = require("express-rate-limit");
const { exec } = require("child_process");
const util = require("util");
const PocketBase = require("pocketbase/cjs");

const app = express();
const PORT = process.env.PORT || 7801;
const execAsync = util.promisify(exec);

// Configuration from environment variables
const CONFIG = {
  password:
    process.env.PASSWORD_HASH ||
    "$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi", // 'password' - Change this!
  sessionSecret:
    process.env.SESSION_SECRET || "octagon-launcher-secret-key-change-this",
  refreshInterval: parseInt(process.env.REFRESH_INTERVAL) || 5000, // 5 seconds
  pocketbase: {
    url: process.env.POCKETBASE_URL || "https://pb.ziistdio.com",
    email: process.env.POCKETBASE_EMAIL,
    password: process.env.POCKETBASE_PASSWORD,
    collection: process.env.POCKETBASE_COLLECTION || "applications",
  },
};

// Validate required environment variables
if (!CONFIG.pocketbase.email || !CONFIG.pocketbase.password) {
  console.error(
    "❌ Missing required Pocketbase credentials in environment variables"
  );
  console.error(
    "Please set POCKETBASE_EMAIL and POCKETBASE_PASSWORD in your .env file"
  );
  process.exit(1);
}

// Initialize Pocketbase client
const pb = new PocketBase(CONFIG.pocketbase.url);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Rate limiting for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: "Too many login attempts, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Session configuration
app.use(
  session({
    secret: CONFIG.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Set to true if using HTTPS
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Global system data storage
let systemData = {};
let applications = [];
let pocketbaseConnected = false;

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session.authenticated) {
    next();
  } else {
    res.redirect("/login");
  }
}

// Pocketbase authentication
async function authenticatePocketbase() {
  try {
    console.log("🔐 Authenticating with Pocketbase...");
    await pb.admins.authWithPassword(
      CONFIG.pocketbase.email,
      CONFIG.pocketbase.password
    );
    pocketbaseConnected = true;
    console.log("✅ Pocketbase authentication successful");
    return true;
  } catch (error) {
    console.error("❌ Pocketbase authentication failed:", error.message);
    pocketbaseConnected = false;
    return false;
  }
}

// Load applications from Pocketbase
async function loadApplications() {
  try {
    if (!pocketbaseConnected) {
      const authSuccess = await authenticatePocketbase();
      if (!authSuccess) {
        console.log(
          "⚠️  Using fallback empty applications list due to Pocketbase connection failure"
        );
        applications = [];
        return;
      }
    }

    console.log("📱 Fetching applications from Pocketbase...");
    const records = await pb
      .collection(CONFIG.pocketbase.collection)
      .getFullList({
        sort: "name", // Sort by name alphabetically
      });

    applications = records.map((record) => ({
      id: record.id,
      name: record.name,
      description: record.description || "",
      url: record.url,
      icon: record.icon || "apps",
    }));

    console.log(
      `✅ Loaded ${applications.length} applications from Pocketbase`
    );
  } catch (error) {
    console.error(
      "❌ Failed to load applications from Pocketbase:",
      error.message
    );

    // Fallback: try to load from JSON file if it exists
    try {
      console.log("🔄 Attempting fallback to applications.json...");
      const data = await fs.readFile("data/applications.json", "utf8");
      applications = JSON.parse(data);
      console.log(
        `⚠️  Loaded ${applications.length} applications from fallback JSON file`
      );
    } catch (jsonError) {
      console.log(
        "⚠️  No fallback JSON file found, using empty applications list"
      );
      applications = [];
    }
  }
}

// Ensure data directory exists (for potential fallback)
async function ensureDataDirectory() {
  try {
    await fs.access("data");
  } catch {
    await fs.mkdir("data", { recursive: true });
  }
}

// Get battery information using acpi
async function getBatteryInfo() {
  try {
    const { stdout } = await execAsync("acpi -b");
    const batteryLine = stdout.trim();

    if (batteryLine.includes("Battery")) {
      const percentMatch = batteryLine.match(/(\d+)%/);
      const statusMatch = batteryLine.match(/Battery \d+: (.*?),/);
      const timeMatch = batteryLine.match(/(\d{2}:\d{2}:\d{2})/);

      return {
        available: true,
        percentage: percentMatch ? parseInt(percentMatch[1]) : 0,
        status: statusMatch ? statusMatch[1] : "Unknown",
        timeRemaining: timeMatch ? timeMatch[1] : null,
        isCharging: batteryLine.includes("Charging"),
        isDischarging: batteryLine.includes("Discharging"),
      };
    }
  } catch (error) {
    console.log("Battery info not available:", error.message);
  }

  return { available: false };
}

// Get power consumption information
async function getPowerInfo() {
  try {
    // Try to get power consumption data
    const powerData = await si.powerShellGetUserOutput("powercfg /energy");
    // This is a placeholder - actual power consumption is hardware-dependent
    // On Linux, you might try reading from /sys/class/power_supply/ or using powertop

    // For now, we'll estimate based on CPU usage (very rough approximation)
    const cpu = await si.currentLoad();
    const estimatedWatts = Math.round(20 + cpu.currentLoad * 0.8); // Base 20W + load-based

    return {
      available: true,
      estimatedWatts,
      note: "Estimated based on CPU usage",
    };
  } catch (error) {
    return { available: false };
  }
}

// Collect system information
async function collectSystemInfo() {
  try {
    const [cpu, mem, fsSize, osInfo, battery, cpuTemp, power] =
      await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.osInfo(),
        getBatteryInfo(),
        si.cpuTemperature(),
        getPowerInfo(),
      ]);

    const uptime = si.time().uptime;

    systemData = {
      cpu: {
        usage: Math.round(cpu.currentLoad),
        cores: cpu.cpus ? cpu.cpus.length : 0,
      },
      memory: {
        total: Math.round(mem.total / 1024 / 1024 / 1024), // GB
        used: Math.round(mem.used / 1024 / 1024 / 1024), // GB
        percentage: Math.round((mem.used / mem.total) * 100),
      },
      temperature: {
        available: cpuTemp.main !== null && cpuTemp.main !== undefined,
        cpu: cpuTemp.main ? Math.round(cpuTemp.main) : null,
        cores: cpuTemp.cores
          ? cpuTemp.cores.map((temp) => Math.round(temp))
          : [],
      },
      power: power,
      storage: fsSize.map((fs) => ({
        fs: fs.fs,
        size: Math.round(fs.size / 1024 / 1024 / 1024), // GB
        used: Math.round(fs.used / 1024 / 1024 / 1024), // GB
        percentage: Math.round(fs.use),
      })),
      uptime: {
        days: Math.floor(uptime / 86400),
        hours: Math.floor((uptime % 86400) / 3600),
        minutes: Math.floor((uptime % 3600) / 60),
      },
      battery,
      os: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        hostname: osInfo.hostname,
      },
      lastUpdate: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error collecting system info:", error);
  }
}

// Routes
app.get("/login", (req, res) => {
  if (req.session.authenticated) {
    return res.redirect("/");
  }
  res.render("login", { error: null });
});

app.post("/login", loginLimiter, async (req, res) => {
  const { password } = req.body;

  try {
    const isValid = await bcrypt.compare(password, CONFIG.password);
    if (isValid) {
      req.session.authenticated = true;
      res.redirect("/");
    } else {
      res.render("login", { error: "Invalid password" });
    }
  } catch (error) {
    res.render("login", { error: "Authentication error" });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

app.get("/", requireAuth, (req, res) => {
  res.render("dashboard", {
    systemData,
    applications,
    refreshInterval: CONFIG.refreshInterval,
  });
});

app.get("/api/system", requireAuth, (req, res) => {
  res.json(systemData);
});

app.get("/api/applications", requireAuth, async (req, res) => {
  try {
    // Try to refresh applications from Pocketbase
    await loadApplications();
    res.json(applications);
  } catch (error) {
    console.error("Failed to refresh applications:", error);
    // Return cached applications
    res.json(applications);
  }
});

// API endpoint to refresh applications manually
app.post("/api/applications/refresh", requireAuth, async (req, res) => {
  try {
    await loadApplications();
    res.json({
      success: true,
      count: applications.length,
      message: "Applications refreshed successfully",
    });
  } catch (error) {
    console.error("Failed to refresh applications:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    pocketbaseConnected,
    applicationsCount: applications.length,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Initialize and start server
async function initialize() {
  console.log("🚀 Initializing Octagon Launcher...");

  // Ensure data directory exists (for potential fallback)
  await ensureDataDirectory();

  // Authenticate with Pocketbase and load applications
  await loadApplications();

  // Collect initial system information
  await collectSystemInfo();

  // Update system info every 5 seconds
  cron.schedule("*/5 * * * * *", collectSystemInfo);

  // Refresh applications from Pocketbase every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    console.log("🔄 Scheduled refresh of applications from Pocketbase");
    await loadApplications();
  });

  app.listen(PORT, () => {
    console.log(`🚀 Octagon Launcher running on http://localhost:${PORT}`);
    console.log(`📊 System monitoring active`);
    console.log(`🔐 Default password: password (please change this!)`);
    console.log(
      `🗄️  Pocketbase: ${
        pocketbaseConnected ? "✅ Connected" : "❌ Disconnected"
      }`
    );
    console.log(`📱 Applications loaded: ${applications.length}`);
  });
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down Octagon Launcher...");
  if (pb) {
    pb.authStore.clear();
  }
  process.exit(0);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

initialize().catch(console.error);
