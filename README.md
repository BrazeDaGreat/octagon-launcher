# Octagon Launcher

<div align="center">
  <img src="https://img.shields.io/badge/Node.js-14.20.0-blue?style=flat-square" alt="Node.js" />
  <img src="https://img.shields.io/badge/Version-1.0.0-blue?style=flat-square" alt="Version" />
</div>

## 📋 Overview

Octagon Launcher is a modern, beautiful Application Hub designed for home servers. It provides a centralized dashboard to monitor system metrics and access all your self-hosted applications with a single click. Built with Material Design 3 principles, it offers both light and dark themes with smooth animations and responsive design.

## ✨ Features

### 🖥️ System Monitoring
- **Real-time CPU usage** with multi-core support
- **Memory utilization** tracking (RAM usage and total)
- **Temperature monitoring** (CPU core temperatures)
- **Battery status** (for laptops/mobile devices)
- **Power consumption** tracking with monthly estimates
- **System uptime** display
- **Storage usage** for all mounted drives
- **Auto-refresh** every 5 seconds

### 🚀 Application Management
- **PocketBase integration** for dynamic application management
- **Beautiful grid layout** with Material Design cards
- **One-click application access** (opens in new tabs)
- **Search and filtering** capabilities
- **Keyboard shortcuts** for quick access
- **Auto-refresh** applications from database

### 🎨 User Experience
- **Material Design 3** color system
- **Dark/Light theme** support with system preference detection
- **Responsive design** (mobile, tablet, desktop)
- **Smooth animations** and hover effects
- **Keyboard navigation** support
- **Search functionality** with real-time filtering
- **Progressive Web App** ready

### 🔐 Security
- **Password protection** with bcrypt hashing
- **Session management** with configurable timeouts
- **Rate limiting** for login attempts
- **Secure environment** variable configuration

## 🛠️ Prerequisites

Before installing Octagon Launcher, ensure you have:

- **Node.js** (v16 or higher)
- **PNPM** (recommended) or npm/yarn
- **PocketBase instance** (for application management)
- **Linux server** (tested on Ubuntu, Debian, CentOS)

## 📦 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/BrazeDaGreat/octagon-launcher.git
cd octagon-launcher
```

### 2. Install Dependencies
```bash
pnpm install
npm install
bun install
```

### 3. Environment Configuration

Copy the example environment file:
```bash
cp .env.example .env
```

Edit the `.env` file with your configuration:
```bash
vi .env
```

### 4. Generate Password Hash

Generate a bcrypt hash for your password:
```bash
node -e "console.log(require('bcrypt').hashSync('your-password', 10))"
```

Update the `PASSWORD_HASH` in your `.env` file with the generated hash.

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | `7801` | No |
| `SESSION_SECRET` | Session encryption key | `octagon-launcher-secret-key-change-this` | Yes |
| `PASSWORD_HASH` | Bcrypt hash of your password | See example | Yes |
| `POCKETBASE_URL` | Your PocketBase instance URL | `https://link.topb.com/` | Yes |
| `POCKETBASE_EMAIL` | PocketBase admin email | - | Yes |
| `POCKETBASE_PASSWORD` | PocketBase admin password | - | Yes |
| `POCKETBASE_COLLECTION` | Applications collection name | `applications` | No |
| `REFRESH_INTERVAL` | System data refresh interval (ms) | `5000` | No |

### PocketBase Setup

1. **Create a PocketBase instance** or use an existing one
2. **Create an applications collection** with the following fields:
   - `name` (Text) - Application name
   - `description` (Text) - Application description
   - `url` (URL) - Application URL
   - `icon` (Text) - Material Icons name
3. **Add applications** to your collection

#### Example Application Record
```json
{
  "name": "Portainer",
  "description": "Docker container management",
  "url": "http://localhost:9000",
  "icon": "widgets"
}
```

## 🚀 Usage

### Starting the Server

Development mode (with auto-restart):
```bash
pnpm dev
```

Production mode:
```bash
pnpm start
```

### Building CSS (Optional)

If you modify Tailwind styles:
```bash
# Development (with watch)
pnpm run build-css

# Production (minified)
pnpm run build-css-prod
```

### Accessing the Dashboard

1. Open your browser and navigate to `http://localhost:7801`
2. Enter your password to login
3. Enjoy your dashboard!

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + T` | Toggle theme (light/dark) |
| `Ctrl + R` | Refresh system data |
| `Ctrl + Shift + R` | Refresh applications |
| `Ctrl + L` | Logout |
| `Ctrl + F` | Toggle search mode |
| `Ctrl + 1-9` | Open application by index |
| `A-Z` | Quick filter applications |
| `Esc` | Exit search mode |

## 🔌 API Endpoints

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/` | GET | Dashboard page | Yes |
| `/login` | GET/POST | Login page | No |
| `/logout` | GET | Logout | No |
| `/api/system` | GET | System information | Yes |
| `/api/applications` | GET | Applications list | Yes |
| `/api/applications/refresh` | POST | Refresh applications | Yes |
| `/api/health` | GET | Health check | No |

## 🏗️ Development

### Project Structure

```
octagon-launcher/
├── data/                   # Application data (fallback)
│   └── applications.json   # Static applications list
├── public/                 # Static assets
├── views/                  # EJS templates
│   ├── dashboard.ejs       # Main dashboard
│   └── login.ejs          # Login page
├── server.js              # Main server file
├── package.json           # Dependencies
├── .env.example           # Environment template
└── README.md              # This file
```

### Adding New Features

1. **System Metrics**: Modify the `collectSystemInfo()` function in `server.js`
2. **UI Components**: Update the EJS templates in `views/`
3. **Styling**: Customize Tailwind classes or add custom CSS
4. **API Endpoints**: Add new routes in `server.js`

### Development Commands

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build CSS (with watch)
pnpm run build-css

# Start production server
pnpm start
```

## 🔧 Troubleshooting

### Common Issues

1. **PocketBase Connection Failed**
   - Verify your PocketBase URL and credentials
   - Check if PocketBase is running and accessible
   - Ensure the collection exists with correct fields

2. **System Monitoring Not Working**
   - Install required system packages: `sudo apt-get install acpi upower`
   - Check if running on supported Linux distribution
   - Verify file permissions for system information access

3. **Port Already in Use**
   - Change the `PORT` in your `.env` file
   - Kill existing processes: `sudo lsof -ti:7801 | xargs kill -9`

4. **Theme Not Switching**
   - Clear browser cache and localStorage
   - Check if JavaScript is enabled

### System Requirements

- **Linux distributions**: Ubuntu 18+, Debian 9+, CentOS 7+, RHEL 7+
- **System packages**: `acpi` (battery info), `upower` (power consumption)
- **Memory**: Minimum 512MB RAM
- **Storage**: 100MB free space

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Setup

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add some amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Material Design 3** for the beautiful design system
- **Tailwind CSS** for the utility-first CSS framework
- **PocketBase** for the simple backend solution
- **Express.js** for the robust web framework
- **systeminformation** for comprehensive system monitoring

## 📞 Support

If you encounter any issues or have questions:

1. Check the [troubleshooting section](#🔧-troubleshooting)
2. Search existing issues in the repository
3. Create a new issue with detailed information
4. Join our community discussions

---

<div align="center">
  <strong>Built with ❤️ for the self-hosting community</strong>
</div>