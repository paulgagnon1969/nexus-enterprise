#!/usr/bin/env npx ts-node
/**
 * Generate mockup screenshots for the NCC Handbook.
 * 
 * Uses Puppeteer to render HTML mockups to PNG images.
 * 
 * Usage:
 *   npx ts-node scripts/generate-handbook-screenshots.ts
 */

import puppeteer from "puppeteer";
import * as fs from "fs";
import * as path from "path";

const OUTPUT_DIR = path.join(__dirname, "../docs/images/handbook");

// NCC Brand Colors & Styles
const NCC_STYLES = `
  :root {
    --color-bg: #f8fafc;
    --color-surface: #ffffff;
    --color-border: #e2e8f0;
    --color-text: #0f172a;
    --color-muted: #64748b;
    --color-primary: #2563eb;
    --color-primary-soft: #dbeafe;
    --color-success: #22c55e;
    --color-warning: #f59e0b;
    --color-danger: #ef4444;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: var(--color-text);
    background: var(--color-bg);
  }
  .app-shell { display: flex; height: 100vh; }
  .sidebar {
    width: 260px;
    background: var(--color-surface);
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
  }
  .sidebar-header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .logo {
    width: 40px;
    height: 40px;
    background: var(--color-primary);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: bold;
    font-size: 18px;
  }
  .logo-text { font-weight: 600; font-size: 15px; }
  .logo-sub { font-size: 11px; color: var(--color-muted); }
  .nav { flex: 1; padding: 12px 8px; overflow-y: auto; }
  .nav-section { margin-bottom: 16px; }
  .nav-section-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-muted);
    text-transform: uppercase;
    padding: 8px 12px;
    letter-spacing: 0.5px;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    color: var(--color-text);
    font-size: 14px;
  }
  .nav-item:hover { background: var(--color-bg); }
  .nav-item.active { background: var(--color-primary-soft); color: var(--color-primary); font-weight: 500; }
  .nav-icon { width: 20px; text-align: center; }
  .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .header {
    height: 64px;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
  }
  .header-title { font-size: 18px; font-weight: 600; }
  .header-actions { display: flex; gap: 12px; align-items: center; }
  .btn {
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border: none;
  }
  .btn-primary { background: var(--color-primary); color: white; }
  .btn-secondary { background: var(--color-bg); border: 1px solid var(--color-border); }
  .content { flex: 1; padding: 24px; overflow-y: auto; }
  .card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 16px;
  }
  .card-title { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
  .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
  .stat-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    padding: 20px;
  }
  .stat-label { font-size: 12px; color: var(--color-muted); margin-bottom: 4px; }
  .stat-value { font-size: 28px; font-weight: 700; }
  .stat-value.success { color: var(--color-success); }
  .stat-value.warning { color: var(--color-warning); }
  .stat-value.primary { color: var(--color-primary); }
  .table { width: 100%; border-collapse: collapse; }
  .table th, .table td { padding: 12px; text-align: left; border-bottom: 1px solid var(--color-border); }
  .table th { font-size: 12px; font-weight: 600; color: var(--color-muted); text-transform: uppercase; }
  .badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 500;
  }
  .badge-success { background: #dcfce7; color: #166534; }
  .badge-warning { background: #fef3c7; color: #92400e; }
  .badge-info { background: var(--color-primary-soft); color: var(--color-primary); }
  .progress-bar { height: 8px; background: var(--color-border); border-radius: 4px; overflow: hidden; }
  .progress-fill { height: 100%; background: var(--color-primary); border-radius: 4px; }
  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--color-primary-soft);
    color: var(--color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 12px;
  }
  .user-menu { display: flex; align-items: center; gap: 8px; }
`;

// Mockup Templates
const MOCKUPS = {
  dashboard: {
    width: 1280,
    height: 800,
    html: `
      <div class="app-shell">
        <div class="sidebar">
          <div class="sidebar-header">
            <div class="logo">N</div>
            <div>
              <div class="logo-text">NEXUS</div>
              <div class="logo-sub">Contractor Connect</div>
            </div>
          </div>
          <nav class="nav">
            <div class="nav-section">
              <div class="nav-item active"><span class="nav-icon">📊</span> Dashboard</div>
              <div class="nav-item"><span class="nav-icon">📁</span> Projects</div>
              <div class="nav-item"><span class="nav-icon">📝</span> Estimates</div>
              <div class="nav-item"><span class="nav-icon">📅</span> Schedule</div>
              <div class="nav-item"><span class="nav-icon">📋</span> Daily Logs</div>
            </div>
            <div class="nav-section">
              <div class="nav-section-title">Finance</div>
              <div class="nav-item"><span class="nav-icon">⏱️</span> Time Tracking</div>
              <div class="nav-item"><span class="nav-icon">💵</span> Invoicing</div>
              <div class="nav-item"><span class="nav-icon">📈</span> Reports</div>
            </div>
            <div class="nav-section">
              <div class="nav-section-title">Admin</div>
              <div class="nav-item"><span class="nav-icon">👥</span> Team</div>
              <div class="nav-item"><span class="nav-icon">⚙️</span> Settings</div>
            </div>
          </nav>
        </div>
        <div class="main">
          <div class="header">
            <div class="header-title">Dashboard</div>
            <div class="header-actions">
              <button class="btn btn-primary">+ New Project</button>
              <div class="user-menu">
                <div class="avatar">JD</div>
              </div>
            </div>
          </div>
          <div class="content">
            <div class="stat-grid">
              <div class="stat-card">
                <div class="stat-label">Active Projects</div>
                <div class="stat-value primary">12</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Pending Invoices</div>
                <div class="stat-value warning">$47,250</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">This Month Revenue</div>
                <div class="stat-value success">$128,400</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Tasks Due Today</div>
                <div class="stat-value">8</div>
              </div>
            </div>
            <div class="card">
              <div class="card-title">Active Projects</div>
              <table class="table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Client</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th>Due Date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Johnson Residence</strong></td>
                    <td>Sarah Johnson</td>
                    <td><span class="badge badge-success">In Progress</span></td>
                    <td><div class="progress-bar"><div class="progress-fill" style="width: 75%"></div></div></td>
                    <td>Mar 15, 2026</td>
                  </tr>
                  <tr>
                    <td><strong>Oak Park Commercial</strong></td>
                    <td>Oak Park LLC</td>
                    <td><span class="badge badge-warning">Pending Approval</span></td>
                    <td><div class="progress-bar"><div class="progress-fill" style="width: 45%"></div></div></td>
                    <td>Apr 2, 2026</td>
                  </tr>
                  <tr>
                    <td><strong>Riverside Restoration</strong></td>
                    <td>Mike Chen</td>
                    <td><span class="badge badge-info">Estimating</span></td>
                    <td><div class="progress-bar"><div class="progress-fill" style="width: 15%"></div></div></td>
                    <td>May 10, 2026</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `,
  },

  projects: {
    width: 1280,
    height: 800,
    html: `
      <div class="app-shell">
        <div class="sidebar">
          <div class="sidebar-header">
            <div class="logo">N</div>
            <div>
              <div class="logo-text">NEXUS</div>
              <div class="logo-sub">Contractor Connect</div>
            </div>
          </div>
          <nav class="nav">
            <div class="nav-section">
              <div class="nav-item"><span class="nav-icon">📊</span> Dashboard</div>
              <div class="nav-item active"><span class="nav-icon">📁</span> Projects</div>
              <div class="nav-item"><span class="nav-icon">📝</span> Estimates</div>
              <div class="nav-item"><span class="nav-icon">📅</span> Schedule</div>
              <div class="nav-item"><span class="nav-icon">📋</span> Daily Logs</div>
            </div>
          </nav>
        </div>
        <div class="main">
          <div class="header">
            <div class="header-title">Projects</div>
            <div class="header-actions">
              <input type="text" placeholder="Search projects..." style="padding: 8px 12px; border: 1px solid var(--color-border); border-radius: 8px; width: 250px;">
              <button class="btn btn-primary">+ New Project</button>
            </div>
          </div>
          <div class="content">
            <div style="display: flex; gap: 12px; margin-bottom: 20px;">
              <button class="btn btn-secondary" style="background: var(--color-primary-soft); color: var(--color-primary);">All (12)</button>
              <button class="btn btn-secondary">Active (8)</button>
              <button class="btn btn-secondary">Completed (3)</button>
              <button class="btn btn-secondary">On Hold (1)</button>
            </div>
            <div class="card">
              <table class="table">
                <thead>
                  <tr>
                    <th>Project Name</th>
                    <th>Address</th>
                    <th>Client</th>
                    <th>Status</th>
                    <th>Budget</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Johnson Residence</strong><br><span style="color: var(--color-muted); font-size: 12px;">Created Feb 1, 2026</span></td>
                    <td>1234 Oak Street<br><span style="color: var(--color-muted);">Dallas, TX 75201</span></td>
                    <td>Sarah Johnson</td>
                    <td><span class="badge badge-success">In Progress</span></td>
                    <td>$85,000</td>
                    <td><button class="btn btn-secondary" style="padding: 4px 8px;">View</button></td>
                  </tr>
                  <tr>
                    <td><strong>Oak Park Commercial</strong><br><span style="color: var(--color-muted); font-size: 12px;">Created Jan 15, 2026</span></td>
                    <td>567 Commerce Blvd<br><span style="color: var(--color-muted);">Oak Park, TX 75301</span></td>
                    <td>Oak Park LLC</td>
                    <td><span class="badge badge-warning">Pending</span></td>
                    <td>$245,000</td>
                    <td><button class="btn btn-secondary" style="padding: 4px 8px;">View</button></td>
                  </tr>
                  <tr>
                    <td><strong>Riverside Restoration</strong><br><span style="color: var(--color-muted); font-size: 12px;">Created Feb 10, 2026</span></td>
                    <td>890 River Road<br><span style="color: var(--color-muted);">Fort Worth, TX 76102</span></td>
                    <td>Mike Chen</td>
                    <td><span class="badge badge-info">Estimating</span></td>
                    <td>$120,000</td>
                    <td><button class="btn btn-secondary" style="padding: 4px 8px;">View</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `,
  },

  schedule: {
    width: 1280,
    height: 800,
    html: `
      <div class="app-shell">
        <div class="sidebar">
          <div class="sidebar-header">
            <div class="logo">N</div>
            <div>
              <div class="logo-text">NEXUS</div>
              <div class="logo-sub">Contractor Connect</div>
            </div>
          </div>
          <nav class="nav">
            <div class="nav-section">
              <div class="nav-item"><span class="nav-icon">📊</span> Dashboard</div>
              <div class="nav-item"><span class="nav-icon">📁</span> Projects</div>
              <div class="nav-item"><span class="nav-icon">📝</span> Estimates</div>
              <div class="nav-item active"><span class="nav-icon">📅</span> Schedule</div>
              <div class="nav-item"><span class="nav-icon">📋</span> Daily Logs</div>
            </div>
          </nav>
        </div>
        <div class="main">
          <div class="header">
            <div class="header-title">Schedule – Johnson Residence</div>
            <div class="header-actions">
              <button class="btn btn-secondary">← Today</button>
              <button class="btn btn-secondary">Week</button>
              <button class="btn btn-secondary">Month</button>
              <button class="btn btn-primary">+ Add Task</button>
            </div>
          </div>
          <div class="content">
            <div class="card" style="padding: 0; overflow: hidden;">
              <div style="display: grid; grid-template-columns: 200px 1fr; border-bottom: 1px solid var(--color-border);">
                <div style="padding: 12px 16px; font-weight: 600; background: var(--color-bg);">Task</div>
                <div style="display: grid; grid-template-columns: repeat(7, 1fr);">
                  <div style="padding: 12px; text-align: center; font-size: 12px; background: var(--color-bg);">Mon 17</div>
                  <div style="padding: 12px; text-align: center; font-size: 12px; background: var(--color-bg);">Tue 18</div>
                  <div style="padding: 12px; text-align: center; font-size: 12px; background: var(--color-bg);">Wed 19</div>
                  <div style="padding: 12px; text-align: center; font-size: 12px; background: var(--color-bg);">Thu 20</div>
                  <div style="padding: 12px; text-align: center; font-size: 12px; background: var(--color-bg);">Fri 21</div>
                  <div style="padding: 12px; text-align: center; font-size: 12px; background: var(--color-bg);">Sat 22</div>
                  <div style="padding: 12px; text-align: center; font-size: 12px; background: var(--color-bg);">Sun 23</div>
                </div>
              </div>
              <div style="display: grid; grid-template-columns: 200px 1fr; border-bottom: 1px solid var(--color-border);">
                <div style="padding: 16px; font-size: 14px;">Demo & Prep</div>
                <div style="position: relative; height: 50px;">
                  <div style="position: absolute; left: 0; top: 10px; width: calc(100% * 3/7); height: 30px; background: #3b82f6; border-radius: 4px; color: white; padding: 4px 8px; font-size: 12px;">Complete ✓</div>
                </div>
              </div>
              <div style="display: grid; grid-template-columns: 200px 1fr; border-bottom: 1px solid var(--color-border);">
                <div style="padding: 16px; font-size: 14px;">Framing</div>
                <div style="position: relative; height: 50px;">
                  <div style="position: absolute; left: calc(100% * 2/7); top: 10px; width: calc(100% * 3/7); height: 30px; background: #22c55e; border-radius: 4px; color: white; padding: 4px 8px; font-size: 12px;">In Progress</div>
                </div>
              </div>
              <div style="display: grid; grid-template-columns: 200px 1fr; border-bottom: 1px solid var(--color-border);">
                <div style="padding: 16px; font-size: 14px;">Electrical Rough</div>
                <div style="position: relative; height: 50px;">
                  <div style="position: absolute; left: calc(100% * 4/7); top: 10px; width: calc(100% * 2/7); height: 30px; background: #f59e0b; border-radius: 4px; color: white; padding: 4px 8px; font-size: 12px;">Scheduled</div>
                </div>
              </div>
              <div style="display: grid; grid-template-columns: 200px 1fr; border-bottom: 1px solid var(--color-border);">
                <div style="padding: 16px; font-size: 14px;">Plumbing Rough</div>
                <div style="position: relative; height: 50px;">
                  <div style="position: absolute; left: calc(100% * 4/7); top: 10px; width: calc(100% * 2/7); height: 30px; background: #f59e0b; border-radius: 4px; color: white; padding: 4px 8px; font-size: 12px;">Scheduled</div>
                </div>
              </div>
              <div style="display: grid; grid-template-columns: 200px 1fr;">
                <div style="padding: 16px; font-size: 14px;">Drywall</div>
                <div style="position: relative; height: 50px;">
                  <div style="position: absolute; left: calc(100% * 5/7); top: 10px; width: calc(100% * 2/7); height: 30px; background: #94a3b8; border-radius: 4px; color: white; padding: 4px 8px; font-size: 12px;">Not Started</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `,
  },

  estimates: {
    width: 1280,
    height: 800,
    html: `
      <div class="app-shell">
        <div class="sidebar">
          <div class="sidebar-header">
            <div class="logo">N</div>
            <div>
              <div class="logo-text">NEXUS</div>
              <div class="logo-sub">Contractor Connect</div>
            </div>
          </div>
          <nav class="nav">
            <div class="nav-section">
              <div class="nav-item"><span class="nav-icon">📊</span> Dashboard</div>
              <div class="nav-item"><span class="nav-icon">📁</span> Projects</div>
              <div class="nav-item active"><span class="nav-icon">📝</span> Estimates</div>
              <div class="nav-item"><span class="nav-icon">📅</span> Schedule</div>
              <div class="nav-item"><span class="nav-icon">📋</span> Daily Logs</div>
            </div>
          </nav>
        </div>
        <div class="main">
          <div class="header">
            <div class="header-title">Estimate – Johnson Residence</div>
            <div class="header-actions">
              <button class="btn btn-secondary">Preview PDF</button>
              <button class="btn btn-primary">Send to Client</button>
            </div>
          </div>
          <div class="content">
            <div style="display: flex; gap: 24px;">
              <div style="flex: 2;">
                <div class="card">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <div class="card-title" style="margin: 0;">Line Items</div>
                    <button class="btn btn-secondary" style="padding: 6px 12px;">+ Add Line</button>
                  </div>
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Description</th>
                        <th>Qty</th>
                        <th>Unit</th>
                        <th>Rate</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><span class="badge badge-info">DEM</span></td>
                        <td>Demo existing kitchen cabinets</td>
                        <td>1</td>
                        <td>LS</td>
                        <td>$2,500.00</td>
                        <td><strong>$2,500.00</strong></td>
                      </tr>
                      <tr>
                        <td><span class="badge badge-info">FRM</span></td>
                        <td>Frame new kitchen island</td>
                        <td>48</td>
                        <td>LF</td>
                        <td>$12.50</td>
                        <td><strong>$600.00</strong></td>
                      </tr>
                      <tr>
                        <td><span class="badge badge-info">ELE</span></td>
                        <td>Install recessed lighting (6")</td>
                        <td>8</td>
                        <td>EA</td>
                        <td>$185.00</td>
                        <td><strong>$1,480.00</strong></td>
                      </tr>
                      <tr>
                        <td><span class="badge badge-info">PLM</span></td>
                        <td>Relocate sink plumbing</td>
                        <td>1</td>
                        <td>LS</td>
                        <td>$1,200.00</td>
                        <td><strong>$1,200.00</strong></td>
                      </tr>
                      <tr>
                        <td><span class="badge badge-info">DRY</span></td>
                        <td>Drywall - 1/2" standard</td>
                        <td>320</td>
                        <td>SF</td>
                        <td>$3.25</td>
                        <td><strong>$1,040.00</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div style="flex: 1;">
                <div class="card">
                  <div class="card-title">Summary</div>
                  <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--color-border);">
                    <span>Subtotal</span>
                    <span>$6,820.00</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--color-border);">
                    <span>O&P (20%)</span>
                    <span>$1,364.00</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--color-border);">
                    <span>Tax (8.25%)</span>
                    <span>$675.18</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; padding: 12px 0; font-size: 18px; font-weight: 700;">
                    <span>Total</span>
                    <span style="color: var(--color-primary);">$8,859.18</span>
                  </div>
                </div>
                <div class="card">
                  <div class="card-title">Status</div>
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                    <span class="badge badge-warning">Draft</span>
                    <span style="color: var(--color-muted); font-size: 13px;">Not sent</span>
                  </div>
                  <div style="font-size: 13px; color: var(--color-muted);">Created Feb 15, 2026</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `,
  },

  dailyLog: {
    width: 1280,
    height: 800,
    html: `
      <div class="app-shell">
        <div class="sidebar">
          <div class="sidebar-header">
            <div class="logo">N</div>
            <div>
              <div class="logo-text">NEXUS</div>
              <div class="logo-sub">Contractor Connect</div>
            </div>
          </div>
          <nav class="nav">
            <div class="nav-section">
              <div class="nav-item"><span class="nav-icon">📊</span> Dashboard</div>
              <div class="nav-item"><span class="nav-icon">📁</span> Projects</div>
              <div class="nav-item"><span class="nav-icon">📝</span> Estimates</div>
              <div class="nav-item"><span class="nav-icon">📅</span> Schedule</div>
              <div class="nav-item active"><span class="nav-icon">📋</span> Daily Logs</div>
            </div>
          </nav>
        </div>
        <div class="main">
          <div class="header">
            <div class="header-title">Daily Log – Feb 19, 2026</div>
            <div class="header-actions">
              <button class="btn btn-secondary">← Previous Day</button>
              <button class="btn btn-secondary">Next Day →</button>
              <button class="btn btn-primary">Submit Log</button>
            </div>
          </div>
          <div class="content">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
              <div>
                <div class="card">
                  <div class="card-title">📍 Johnson Residence</div>
                  <div style="margin-bottom: 16px;">
                    <label style="font-size: 12px; font-weight: 600; color: var(--color-muted); display: block; margin-bottom: 6px;">Work Completed</label>
                    <div style="background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 8px; padding: 12px; min-height: 80px;">Completed framing for kitchen island. Installed 6 of 8 recessed light housings. Rough electrical inspection scheduled for tomorrow.</div>
                  </div>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                      <label style="font-size: 12px; font-weight: 600; color: var(--color-muted); display: block; margin-bottom: 6px;">Weather</label>
                      <div style="display: flex; align-items: center; gap: 8px;"><span>☀️</span> Clear, 72°F</div>
                    </div>
                    <div>
                      <label style="font-size: 12px; font-weight: 600; color: var(--color-muted); display: block; margin-bottom: 6px;">Crew Size</label>
                      <div>3 workers</div>
                    </div>
                  </div>
                </div>
                <div class="card">
                  <div class="card-title">📷 Photos (4)</div>
                  <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
                    <div style="aspect-ratio: 1; background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center;">🖼️</div>
                    <div style="aspect-ratio: 1; background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center;">🖼️</div>
                    <div style="aspect-ratio: 1; background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center;">🖼️</div>
                    <div style="aspect-ratio: 1; background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center;">🖼️</div>
                  </div>
                </div>
              </div>
              <div>
                <div class="card">
                  <div class="card-title">⏱️ Labor Hours</div>
                  <table class="table">
                    <thead>
                      <tr><th>Employee</th><th>Hours</th><th>Task</th></tr>
                    </thead>
                    <tbody>
                      <tr><td>Mike Torres</td><td>8.0</td><td>Framing</td></tr>
                      <tr><td>James Wilson</td><td>8.0</td><td>Electrical rough</td></tr>
                      <tr><td>Carlos Ruiz</td><td>6.5</td><td>General labor</td></tr>
                    </tbody>
                  </table>
                  <div style="display: flex; justify-content: space-between; padding-top: 12px; font-weight: 600;">
                    <span>Total Hours</span>
                    <span>22.5 hrs</span>
                  </div>
                </div>
                <div class="card">
                  <div class="card-title">📦 Materials Used</div>
                  <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; justify-content: space-between;"><span>2x4 studs</span><span>24 pcs</span></div>
                    <div style="display: flex; justify-content: space-between;"><span>Recessed light housing</span><span>6 pcs</span></div>
                    <div style="display: flex; justify-content: space-between;"><span>Romex 12/2</span><span>150 ft</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `,
  },

  timeTracking: {
    width: 1280,
    height: 800,
    html: `
      <div class="app-shell">
        <div class="sidebar">
          <div class="sidebar-header">
            <div class="logo">N</div>
            <div>
              <div class="logo-text">NEXUS</div>
              <div class="logo-sub">Contractor Connect</div>
            </div>
          </div>
          <nav class="nav">
            <div class="nav-section">
              <div class="nav-item"><span class="nav-icon">📊</span> Dashboard</div>
              <div class="nav-item"><span class="nav-icon">📁</span> Projects</div>
              <div class="nav-item"><span class="nav-icon">📝</span> Estimates</div>
              <div class="nav-item"><span class="nav-icon">📅</span> Schedule</div>
              <div class="nav-item"><span class="nav-icon">📋</span> Daily Logs</div>
            </div>
            <div class="nav-section">
              <div class="nav-section-title">Finance</div>
              <div class="nav-item active"><span class="nav-icon">⏱️</span> Time Tracking</div>
              <div class="nav-item"><span class="nav-icon">💵</span> Invoicing</div>
            </div>
          </nav>
        </div>
        <div class="main">
          <div class="header">
            <div class="header-title">Time Tracking – Week of Feb 17</div>
            <div class="header-actions">
              <button class="btn btn-secondary">← Prev Week</button>
              <button class="btn btn-secondary">Next Week →</button>
              <button class="btn btn-primary">Export Payroll</button>
            </div>
          </div>
          <div class="content">
            <div class="card" style="padding: 0; overflow: hidden;">
              <table class="table" style="margin: 0;">
                <thead>
                  <tr style="background: var(--color-bg);">
                    <th style="width: 180px;">Employee</th>
                    <th style="text-align: center;">Mon</th>
                    <th style="text-align: center;">Tue</th>
                    <th style="text-align: center;">Wed</th>
                    <th style="text-align: center;">Thu</th>
                    <th style="text-align: center;">Fri</th>
                    <th style="text-align: center;">Sat</th>
                    <th style="text-align: center;">Sun</th>
                    <th style="text-align: center;">Total</th>
                    <th style="text-align: right;">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Mike Torres</strong><br><span style="font-size: 12px; color: var(--color-muted);">Lead Carpenter</span></td>
                    <td style="text-align: center;">8.0</td>
                    <td style="text-align: center;">8.0</td>
                    <td style="text-align: center;">8.0</td>
                    <td style="text-align: center; background: #fef3c7;">10.0</td>
                    <td style="text-align: center;">8.0</td>
                    <td style="text-align: center; color: var(--color-muted);">—</td>
                    <td style="text-align: center; color: var(--color-muted);">—</td>
                    <td style="text-align: center; font-weight: 700;">42.0</td>
                    <td style="text-align: right;"><span class="badge badge-success">Approved</span></td>
                  </tr>
                  <tr>
                    <td><strong>James Wilson</strong><br><span style="font-size: 12px; color: var(--color-muted);">Electrician</span></td>
                    <td style="text-align: center;">8.0</td>
                    <td style="text-align: center;">8.0</td>
                    <td style="text-align: center;">8.0</td>
                    <td style="text-align: center;">8.0</td>
                    <td style="text-align: center;">8.0</td>
                    <td style="text-align: center; color: var(--color-muted);">—</td>
                    <td style="text-align: center; color: var(--color-muted);">—</td>
                    <td style="text-align: center; font-weight: 700;">40.0</td>
                    <td style="text-align: right;"><span class="badge badge-success">Approved</span></td>
                  </tr>
                  <tr>
                    <td><strong>Carlos Ruiz</strong><br><span style="font-size: 12px; color: var(--color-muted);">Laborer</span></td>
                    <td style="text-align: center;">6.5</td>
                    <td style="text-align: center;">8.0</td>
                    <td style="text-align: center;">7.5</td>
                    <td style="text-align: center;">8.0</td>
                    <td style="text-align: center; background: #fee2e2;">—</td>
                    <td style="text-align: center; color: var(--color-muted);">—</td>
                    <td style="text-align: center; color: var(--color-muted);">—</td>
                    <td style="text-align: center; font-weight: 700;">30.0</td>
                    <td style="text-align: right;"><span class="badge badge-warning">Pending</span></td>
                  </tr>
                  <tr>
                    <td><strong>Lisa Chen</strong><br><span style="font-size: 12px; color: var(--color-muted);">Project Manager</span></td>
                    <td style="text-align: center;">8.0</td>
                    <td style="text-align: center;">8.0</td>
                    <td style="text-align: center;">8.0</td>
                    <td style="text-align: center;">8.0</td>
                    <td style="text-align: center;">8.0</td>
                    <td style="text-align: center; color: var(--color-muted);">—</td>
                    <td style="text-align: center; color: var(--color-muted);">—</td>
                    <td style="text-align: center; font-weight: 700;">40.0</td>
                    <td style="text-align: right;"><span class="badge badge-success">Approved</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style="display: flex; gap: 16px; margin-top: 20px;">
              <div class="stat-card" style="flex: 1;">
                <div class="stat-label">Total Hours This Week</div>
                <div class="stat-value primary">152.0</div>
              </div>
              <div class="stat-card" style="flex: 1;">
                <div class="stat-label">Overtime Hours</div>
                <div class="stat-value warning">2.0</div>
              </div>
              <div class="stat-card" style="flex: 1;">
                <div class="stat-label">Pending Approval</div>
                <div class="stat-value">1</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `,
  },

  invoicing: {
    width: 1280,
    height: 800,
    html: `
      <div class="app-shell">
        <div class="sidebar">
          <div class="sidebar-header">
            <div class="logo">N</div>
            <div>
              <div class="logo-text">NEXUS</div>
              <div class="logo-sub">Contractor Connect</div>
            </div>
          </div>
          <nav class="nav">
            <div class="nav-section">
              <div class="nav-item"><span class="nav-icon">📊</span> Dashboard</div>
              <div class="nav-item"><span class="nav-icon">📁</span> Projects</div>
              <div class="nav-item"><span class="nav-icon">📝</span> Estimates</div>
            </div>
            <div class="nav-section">
              <div class="nav-section-title">Finance</div>
              <div class="nav-item"><span class="nav-icon">⏱️</span> Time Tracking</div>
              <div class="nav-item active"><span class="nav-icon">💵</span> Invoicing</div>
            </div>
          </nav>
        </div>
        <div class="main">
          <div class="header">
            <div class="header-title">Invoices</div>
            <div class="header-actions">
              <input type="text" placeholder="Search invoices..." style="padding: 8px 12px; border: 1px solid var(--color-border); border-radius: 8px; width: 200px;">
              <button class="btn btn-primary">+ Create Invoice</button>
            </div>
          </div>
          <div class="content">
            <div class="stat-grid">
              <div class="stat-card">
                <div class="stat-label">Outstanding</div>
                <div class="stat-value warning">$47,250</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Paid This Month</div>
                <div class="stat-value success">$82,400</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Overdue</div>
                <div class="stat-value" style="color: var(--color-danger);">$12,800</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Draft</div>
                <div class="stat-value">3</div>
              </div>
            </div>
            <div class="card">
              <table class="table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Project</th>
                    <th>Client</th>
                    <th>Amount</th>
                    <th>Due Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>INV-2026-042</strong></td>
                    <td>Johnson Residence</td>
                    <td>Sarah Johnson</td>
                    <td>$8,859.18</td>
                    <td>Mar 1, 2026</td>
                    <td><span class="badge badge-warning">Pending</span></td>
                    <td><button class="btn btn-secondary" style="padding: 4px 8px;">View</button></td>
                  </tr>
                  <tr>
                    <td><strong>INV-2026-041</strong></td>
                    <td>Oak Park Commercial</td>
                    <td>Oak Park LLC</td>
                    <td>$24,500.00</td>
                    <td>Feb 15, 2026</td>
                    <td><span class="badge" style="background: #fee2e2; color: #991b1b;">Overdue</span></td>
                    <td><button class="btn btn-secondary" style="padding: 4px 8px;">View</button></td>
                  </tr>
                  <tr>
                    <td><strong>INV-2026-040</strong></td>
                    <td>Riverside Restoration</td>
                    <td>Mike Chen</td>
                    <td>$15,200.00</td>
                    <td>Feb 10, 2026</td>
                    <td><span class="badge badge-success">Paid</span></td>
                    <td><button class="btn btn-secondary" style="padding: 4px 8px;">View</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `,
  },

  mobile: {
    width: 390,
    height: 844,
    html: `
      <div style="background: var(--color-bg); height: 100vh; display: flex; flex-direction: column;">
        <div style="background: var(--color-primary); color: white; padding: 16px 20px; padding-top: 48px;">
          <div style="font-size: 13px; opacity: 0.8; margin-bottom: 4px;">Good morning, John</div>
          <div style="font-size: 22px; font-weight: 600;">Dashboard</div>
        </div>
        <div style="flex: 1; padding: 16px; overflow-y: auto;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
            <div class="card" style="padding: 16px; text-align: center;">
              <div style="font-size: 28px; margin-bottom: 4px;">📁</div>
              <div style="font-size: 24px; font-weight: 700; color: var(--color-primary);">12</div>
              <div style="font-size: 12px; color: var(--color-muted);">Active Projects</div>
            </div>
            <div class="card" style="padding: 16px; text-align: center;">
              <div style="font-size: 28px; margin-bottom: 4px;">✅</div>
              <div style="font-size: 24px; font-weight: 700; color: var(--color-success);">8</div>
              <div style="font-size: 12px; color: var(--color-muted);">Tasks Today</div>
            </div>
          </div>
          <div style="font-weight: 600; margin-bottom: 12px;">Today's Tasks</div>
          <div class="card" style="padding: 0;">
            <div style="padding: 14px 16px; border-bottom: 1px solid var(--color-border); display: flex; align-items: center; gap: 12px;">
              <div style="width: 24px; height: 24px; border: 2px solid var(--color-success); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--color-success);">✓</div>
              <div style="flex: 1;">
                <div style="font-weight: 500;">Complete framing inspection</div>
                <div style="font-size: 12px; color: var(--color-muted);">Johnson Residence</div>
              </div>
            </div>
            <div style="padding: 14px 16px; border-bottom: 1px solid var(--color-border); display: flex; align-items: center; gap: 12px;">
              <div style="width: 24px; height: 24px; border: 2px solid var(--color-border); border-radius: 50%;"></div>
              <div style="flex: 1;">
                <div style="font-weight: 500;">Order drywall materials</div>
                <div style="font-size: 12px; color: var(--color-muted);">Oak Park Commercial</div>
              </div>
            </div>
            <div style="padding: 14px 16px; display: flex; align-items: center; gap: 12px;">
              <div style="width: 24px; height: 24px; border: 2px solid var(--color-border); border-radius: 50%;"></div>
              <div style="flex: 1;">
                <div style="font-weight: 500;">Submit daily log</div>
                <div style="font-size: 12px; color: var(--color-muted);">Riverside Restoration</div>
              </div>
            </div>
          </div>
        </div>
        <div style="background: var(--color-surface); border-top: 1px solid var(--color-border); display: flex; justify-content: space-around; padding: 12px 0;">
          <div style="text-align: center; color: var(--color-primary);">
            <div style="font-size: 24px;">🏠</div>
            <div style="font-size: 10px; font-weight: 500;">Home</div>
          </div>
          <div style="text-align: center; color: var(--color-muted);">
            <div style="font-size: 24px;">📁</div>
            <div style="font-size: 10px;">Projects</div>
          </div>
          <div style="text-align: center; color: var(--color-muted);">
            <div style="font-size: 24px;">⏱️</div>
            <div style="font-size: 10px;">Time</div>
          </div>
          <div style="text-align: center; color: var(--color-muted);">
            <div style="font-size: 24px;">📋</div>
            <div style="font-size: 10px;">Logs</div>
          </div>
          <div style="text-align: center; color: var(--color-muted);">
            <div style="font-size: 24px;">⚙️</div>
            <div style="font-size: 10px;">More</div>
          </div>
        </div>
      </div>
    `,
  },
};

async function generateScreenshot(name: string, mockup: typeof MOCKUPS.dashboard) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setViewport({
    width: mockup.width,
    height: mockup.height,
    deviceScaleFactor: 2, // Retina quality
  });

  const fullHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>${NCC_STYLES}</style>
    </head>
    <body>${mockup.html}</body>
    </html>
  `;

  await page.setContent(fullHtml, { waitUntil: "networkidle0" });

  const outputPath = path.join(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ path: outputPath, type: "png" });

  await browser.close();
  console.log(`✓ Generated: ${outputPath}`);
}

async function main() {
  console.log("=".repeat(50));
  console.log("NCC Handbook Screenshot Generator");
  console.log("=".repeat(50));

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`Created output directory: ${OUTPUT_DIR}`);
  }

  console.log("\nGenerating mockup screenshots...\n");

  for (const [name, mockup] of Object.entries(MOCKUPS)) {
    await generateScreenshot(name, mockup);
  }

  console.log("\n" + "=".repeat(50));
  console.log(`Done! Screenshots saved to: ${OUTPUT_DIR}`);
  console.log("=".repeat(50));
}

main().catch(console.error);
