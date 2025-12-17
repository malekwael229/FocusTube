# FocusTube 🛡️

**Stop Doomscrolling. Reclaim Your Attention.**

FocusTube is a lightweight, aesthetic Chrome Extension designed to prevent you from getting sucked into the YouTube Shorts loophole. It cleans up the YouTube interface and offers flexible blocking modes to help you stay productive.

![FocusTube Banner](https://img.shields.io/badge/Focus-Tube-blue?style=for-the-badge&logo=youtube&logoColor=white) ![Version](https://img.shields.io/badge/Version-1.2-green?style=for-the-badge)

## ✨ Features

### 🚫 Smart Blocking Modes
*   **Strict Mode:** Zero tolerance. If you try to open a Short, you are instantly redirected to the Homepage.
*   **Soft Mode (Warn):** Displays a beautiful, Apple-style warning overlay ("Shorts & Distractions Blocked").
    *   Stops video and audio autoplay immediately.
    *   Gives you a conscious choice: "Go Back" or "Watch Anyway".
*   **Passive Mode:** Disables protections temporarily without uninstalling.

### 🧹 UI Cleanup
*   **Hides Distractions:** Removes the "Shorts" tab from the sidebar, hides Shorts shelves from the homepage, and removes Shorts chips from search filters.
*   **History Safe:** Intelligently detects the History page to prevent layout breakage.

### 🎨 Modern Design
*   **New UI:** Clean, neumorphic popup interface.
*   **Dark Mode:** Built-in Dark Mode support for both the settings popup and the warning overlay (Enabled by default).
*   **Seamless Experience:** No flashing content or jarring transitions.

## 📥 Installation

Since this extension is currently in development/source form:

1.  **Download/Clone** this repository to your computer.
    ```bash
    git clone https://github.com/malekwael229/FocusTube.git
    ```
2.  Open **Google Chrome** (or Edge/Brave).
3.  Navigate to `chrome://extensions/`.
4.  Toggle **Developer mode** in the top right corner.
5.  Click **Load unpacked**.
6.  Select the folder where you downloaded FocusTube.

## ⚙️ Usage

1.  Click the **FocusTube icon** in your browser toolbar.
2.  **Main Toggle:** Turn the extension functionality On/Off.
3.  **Mode Select:** Choose between **Strict** (Kick out) or **Soft** (Warning).
4.  **Dark Mode:** Toggle the visual theme.

## 🛠️ Tech Stack

*   **Manifest V3:** Compliant with modern Chrome extension standards.
*   **JavaScript:** Native ES6+, aggressive event interception for autoplay blocking.
*   **CSS3:** Flexbox/Grid, CSS Variables, and Backdrop filters for the "glassmorphism" look.

## 🤝 Contributing

Contributions are welcome! If you find a bug or have a feature request:
1.  Fork the repository.
2.  Create a new branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes.
4.  Open a Pull Request.

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
```
