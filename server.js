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

const app = express();
const PORT = 7801;
const execAsync = util.promisify(exec);

// Configuration
const CONFIG = {
  password: "$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi", // 'password' - Change this!
  sessionSecret: "octagon-launcher-secret-key-change-this",
  refreshInterval: 5000, // 5 seconds
};

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

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session.authenticated) {
    next();
  } else {
    res.redirect("/login");
  }
}

// Load applications from JSON file
async function loadApplications() {
  try {
    const data = await fs.readFile("data/applications.json", "utf8");
    applications = JSON.parse(data);
  } catch (error) {
    console.log("No applications.json found, creating empty list");
    applications = [];
    // Create default applications file
    await ensureDataDirectory();
    await fs.writeFile("data/applications.json", JSON.stringify([], null, 2));
  }
}

// Ensure data directory exists
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

app.get("/api/applications", requireAuth, (req, res) => {
  res.json(applications);
});

// Initialize and start server
async function initialize() {
  await ensureDataDirectory();
  await loadApplications();
  await collectSystemInfo();

  // Update system info every 5 seconds
  cron.schedule("*/5 * * * * *", collectSystemInfo);

  app.listen(PORT, () => {
    console.log(`🚀 Octagon Launcher running on http://localhost:${PORT}`);
    console.log(`📊 System monitoring active`);
    console.log(`🔐 Default password: password (please change this!)`);
  });
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down Octagon Launcher...");
  process.exit(0);
});

initialize().catch(console.error);
