import React, { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { db, DEFAULT_FACILITIES } from './lib/supabase';
import SurgeryScheduler from './components/SurgeryScheduler';
import StaffManagement from './components/StaffManagement';
import CPTManagement from './components/CPTManagement';
import OTCostManagement from './components/OTCostManagement';
import SettingsView from './components/Settings';
import CPTUpload from './components/CPTUpload';
import Chatbot from './components/Chatbot';
import AIAnalystModal from './components/AIAnalystModal';
import AIOperationsAnalyst from './components/AIOperationsAnalyst';
import CommandCenter from './components/CommandCenter';
import BusinessAnalysis from './components/BusinessAnalysis';
import ORBlockSchedule from './components/ORBlockSchedule';
import CaseLogScheduler from './components/CaseLogScheduler';
import InstructionPanel from './components/InstructionPanel';
import LoginPage from './components/LoginPage';
import SurgeonPortal from './components/SurgeonPortal';
import UserProfile from './components/UserProfile';
import UserManagement from './components/UserManagement';
import RoleManagement from './components/RoleManagement';
import AuditLogViewer from './components/AuditLogViewer';
import RoleGate from './components/RoleGate';
import { rbacService, CANONICAL_ROLES } from './lib/rbacService';
import Swal from 'sweetalert2';
import { useInactivityTimeout } from './hooks/useInactivityTimeout';
import { maskMRN, maskPatientName, maskDOB, maskPhone } from './utils/phiMasking';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  LayoutDashboard,
  Clock,
  Stethoscope,
  TrendingUp,
  Package,
  AlertTriangle,
  Sparkles,
  DollarSign,
  Settings,
  Sliders,
  CheckCircle,
  Search,
  Download,
  XCircle,
  UserCheck,
  Users,
  Shield,
  ShieldAlert,
  Edit,
  Trash2,
  Plus,
  CalendarDays,
  Bot,
  Activity,
  Sun,
  Moon,
  Brain,
  Upload,
  LogOut,
  User,
  Building2,
  ChevronDown,
  CheckCircle2
} from 'lucide-react';

// ==========================================
// MTD COMMAND CENTER MOCK DATA
// ==========================================


const MOCK_SURGEON_PERF = [
  { name: 'Dr. Malinoski Kelly', netMargin: 263450, marginCase: 5488 },
  { name: 'Dr. Gardner Paul', netMargin: 215630, marginCase: 5989 },
  { name: 'Dr. Bonett Andrew', netMargin: 157850, marginCase: 5637 },
  { name: 'Dr. Walsh Mark', netMargin: 142910, marginCase: 3485 },
  { name: 'Dr. Baccaro Leopoldo', netMargin: 85230, marginCase: 2749 }
];

const MOCK_SURGEONS_DETAILS = {
  'Dr. Malinoski Kelly': {
    name: 'Dr. Malinoski Kelly',
    specialty: 'Orthopedic Surgery',
    avatar: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=256&h=256&q=80',
    color: '#3b82f6',
    status: 'Active',
    npi: '1982736450',
    metrics: {
      cases: 48,
      avgDuration: 68,
      avgTurnover: 18,
      supplyVariance: '+18.4%',
      netMargin: 263450,
      avgMargin: 5488,
      onTimeStart: 92,
      utilization: 78
    },
    caseHistory: [
      { name: 'Jan', cases: 38, margin: 198000, revenue: 480000 },
      { name: 'Feb', cases: 42, margin: 220000, revenue: 530000 },
      { name: 'Mar', cases: 40, margin: 210000, revenue: 505000 },
      { name: 'Apr', cases: 45, margin: 245000, revenue: 580000 },
      { name: 'May', cases: 48, margin: 263450, revenue: 616416 }
    ],
    payerMix: [
      { name: 'Commercial', value: 28, revenue: 420000, margin: 190000, color: 'var(--color-blue)' },
      { name: 'Medicare', value: 16, revenue: 156416, margin: 63450, color: 'var(--color-green)' },
      { name: 'Self-Pay', value: 4, revenue: 40000, margin: 10000, color: 'var(--color-orange)' }
    ],
    supplyWaste: [
      { item: 'Orthopedic Implant Anchor', opened: 8, used: 6, wasteCost: 900, type: 'Implant' },
      { item: 'Suture Packs (Vicryl 2-0)', opened: 12, used: 6, wasteCost: 180, type: 'Suture' },
      { item: 'Disposable Drape Pack', opened: 2, used: 1, wasteCost: 120, type: 'Disposable' }
    ],
    recentCancellations: [
      { date: 'May 20', procedure: 'Knee Arthroscopy', reason: 'Pre-Op Vitals High', loss: 5823 },
      { date: 'May 12', procedure: 'Total Knee Joint Repair', reason: 'Patient No-Show', loss: 7905 }
    ],
    aiInsights: [
      { id: 1, type: 'high', icon: '💲', title: 'Standardize Anchor Brand', desc: "Standardizing implant anchors can save $900 per 10 cases based on Dr. Malinoski's baseline preference card." },
      { id: 2, type: 'med', icon: '⏳', title: 'Parallel Anesthesia Prep', desc: 'Pre-op block room blocks could reduce avg procedure duration by 6 mins, adding 4 potential slots per month.' }
    ],
    cptBreakdown: [
      { code: '27130', desc: 'Total Hip Replacement', cases: 18, avgTime: 110, margin: 125400 },
      { code: '29827', desc: 'Knee Scope / Arthroscopy', cases: 20, avgTime: 58, margin: 116460 },
      { code: '27447', desc: 'Total Knee Joint Repair', cases: 10, avgTime: 92, margin: 21590 }
    ]
  },
  'Dr. Gardner Paul': {
    name: 'Dr. Gardner Paul',
    specialty: 'General Surgery',
    avatar: 'https://images.unsplash.com/photo-1594824813573-246434de83fb?auto=format&fit=crop&w=256&h=256&q=80',
    color: '#10b981',
    status: 'Active',
    npi: '1728394051',
    metrics: {
      cases: 36,
      avgDuration: 52,
      avgTurnover: 14,
      supplyVariance: '-2.1%',
      netMargin: 215630,
      avgMargin: 5989,
      onTimeStart: 96,
      utilization: 84
    },
    caseHistory: [
      { name: 'Jan', cases: 30, margin: 175000, revenue: 265000 },
      { name: 'Feb', cases: 32, margin: 190000, revenue: 285000 },
      { name: 'Mar', cases: 35, margin: 210000, revenue: 315000 },
      { name: 'Apr', cases: 33, margin: 198000, revenue: 295000 },
      { name: 'May', cases: 36, margin: 215630, revenue: 327780 }
    ],
    payerMix: [
      { name: 'Commercial', value: 20, revenue: 200000, margin: 145000, color: 'var(--color-blue)' },
      { name: 'Medicare', value: 14, revenue: 110000, margin: 65000, color: 'var(--color-green)' },
      { name: 'Self-Pay', value: 2, revenue: 17780, margin: 5630, color: 'var(--color-orange)' }
    ],
    supplyWaste: [
      { item: 'Laparoscopic Trocar 5mm', opened: 4, used: 4, wasteCost: 0, type: 'Disposable' },
      { item: 'Suture Packs (Monocryl 4-0)', opened: 6, used: 5, wasteCost: 35, type: 'Suture' }
    ],
    recentCancellations: [
      { date: 'May 10', procedure: 'Shoulder Arthroscopy', reason: 'Incomplete Pre-Op Clearance', loss: 4200 }
    ],
    aiInsights: [
      { id: 1, type: 'med', icon: '✨', title: 'High Efficiency Benchmark', desc: 'Dr. Gardner achieves turnover times 10 mins faster than the facility baseline. Staff alignment is optimal.' }
    ],
    cptBreakdown: [
      { code: '23430', desc: 'Laparoscopic Cholecystectomy', cases: 22, avgTime: 50, margin: 135400 },
      { code: '49505', desc: 'Inguinal Hernia Repair', cases: 14, avgTime: 55, margin: 80230 }
    ]
  },
  'Dr. Walsh Mark': {
    name: 'Dr. Walsh Mark',
    specialty: 'Ophthalmology & Gen Surgery',
    avatar: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&w=256&h=256&q=80',
    color: '#f59e0b',
    status: 'Active',
    npi: '1092837465',
    metrics: {
      cases: 41,
      avgDuration: 88,
      avgTurnover: 24,
      supplyVariance: '+31.2%',
      netMargin: 142910,
      avgMargin: 3485,
      onTimeStart: 79,
      utilization: 66
    },
    caseHistory: [
      { name: 'Jan', cases: 35, margin: 120000, revenue: 350000 },
      { name: 'Feb', cases: 38, margin: 132000, revenue: 382000 },
      { name: 'Mar', cases: 42, margin: 148000, revenue: 425000 },
      { name: 'Apr', cases: 39, margin: 135000, revenue: 390000 },
      { name: 'May', cases: 41, margin: 142910, revenue: 418300 }
    ],
    payerMix: [
      { name: 'Commercial', value: 15, revenue: 170000, margin: 68000, color: 'var(--color-blue)' },
      { name: 'Medicare', value: 22, revenue: 218300, margin: 69910, color: 'var(--color-green)' },
      { name: 'Self-Pay', value: 4, revenue: 30000, margin: 5000, color: 'var(--color-orange)' }
    ],
    supplyWaste: [
      { item: 'Ophthalmic Viscoelastic Pack', opened: 3, used: 1, wasteCost: 450, type: 'Fluid' },
      { item: 'Custom Phaco Blade 2.2mm', opened: 2, used: 1, wasteCost: 380, type: 'Blade' },
      { item: 'Disposable Drape Set Extra', opened: 4, used: 2, wasteCost: 160, type: 'Disposable' }
    ],
    recentCancellations: [
      { date: 'May 12', procedure: 'Gallbladder (CPT 23430)', reason: 'Patient No-Show', loss: 3450 },
      { date: 'May 5', procedure: 'Hernia Repair', reason: 'Elevated BP', loss: 3750 }
    ],
    aiInsights: [
      { id: 1, type: 'high', icon: '⚠', title: 'Preference Card Overruns', desc: 'Average supply card cost is 31.2% higher than standard Ophthalmology baseline. Standardize Phaco packs.' },
      { id: 2, type: 'med', icon: '📅', title: 'Block Time Release', desc: 'Releasing unused block time 48 hrs in advance will reduce slot wastage and save $4,200/month.' }
    ],
    cptBreakdown: [
      { code: '27447', desc: 'Cataract Surgery', cases: 29, avgTime: 82, margin: 98450 },
      { code: '49505', desc: 'Inguinal Hernia Repair', cases: 12, avgTime: 102, margin: 44460 }
    ]
  },
  'Dr. Bonett Andrew': {
    name: 'Dr. Bonett Andrew',
    specialty: 'Spine Surgery',
    avatar: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=256&h=256&q=80',
    color: '#8b5cf6',
    status: 'Active',
    npi: '1546372819',
    metrics: {
      cases: 28,
      avgDuration: 110,
      avgTurnover: 29,
      supplyVariance: '+8.4%',
      netMargin: 157850,
      avgMargin: 5637,
      onTimeStart: 88,
      utilization: 72
    },
    caseHistory: [
      { name: 'Jan', cases: 22, margin: 121000, revenue: 410000 },
      { name: 'Feb', cases: 25, margin: 139000, revenue: 470000 },
      { name: 'Mar', cases: 24, margin: 132000, revenue: 450000 },
      { name: 'Apr', cases: 26, margin: 145000, revenue: 495000 },
      { name: 'May', cases: 28, margin: 157850, revenue: 531200 }
    ],
    payerMix: [
      { name: 'Commercial', value: 16, revenue: 320000, margin: 110000, color: 'var(--color-blue)' },
      { name: 'Medicare', value: 10, revenue: 181200, margin: 42850, color: 'var(--color-green)' },
      { name: 'Self-Pay', value: 2, revenue: 30000, margin: 5000, color: 'var(--color-orange)' }
    ],
    supplyWaste: [
      { item: 'Spine Stabilization Rod Set', opened: 4, used: 3, wasteCost: 1800, type: 'Implant' },
      { item: 'Hemostatic Matrix Gel', opened: 3, used: 2, wasteCost: 450, type: 'Biologic' },
      { item: 'Disposable Drape Set Large', opened: 2, used: 1, wasteCost: 190, type: 'Disposable' }
    ],
    recentCancellations: [
      { date: 'May 8', procedure: 'Carpal Tunnel Release', reason: 'Pre-Auth Refused', loss: 1620 }
    ],
    aiInsights: [
      { id: 1, type: 'med', icon: '⌛', title: 'High Turnover Alert', desc: 'Average turnover is 29 mins (facility average is 24 mins). Delay caused by heavy setup times.' },
      { id: 2, type: 'high', icon: '💰', title: 'Implant Standardization', desc: 'Consolidating spine rod suppliers can retrieve $6,500 in monthly margin leakage.' }
    ],
    cptBreakdown: [
      { code: '22612', desc: 'Lumbar Spine Fusion', cases: 12, avgTime: 140, margin: 96000 },
      { code: '27132', desc: 'Hip Joint Replacement', cases: 10, avgTime: 115, margin: 58630 },
      { code: '63030', desc: 'Carpal Tunnel Release', cases: 6, avgTime: 40, margin: 3220 }
    ]
  },
  'Dr. Baccaro Leopoldo': {
    name: 'Dr. Baccaro Leopoldo',
    specialty: 'Ophthalmology / Gynecology',
    avatar: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=256&h=256&q=80',
    color: '#ec4899',
    status: 'Active',
    npi: '1859403827',
    metrics: {
      cases: 31,
      avgDuration: 48,
      avgTurnover: 16,
      supplyVariance: '+12.6%',
      netMargin: 85230,
      avgMargin: 2749,
      onTimeStart: 94,
      utilization: 81
    },
    caseHistory: [
      { name: 'Jan', cases: 25, margin: 68000, revenue: 112000 },
      { name: 'Feb', cases: 28, margin: 76000, revenue: 125000 },
      { name: 'Mar', cases: 26, margin: 71000, revenue: 118000 },
      { name: 'Apr', cases: 30, margin: 82000, revenue: 136000 },
      { name: 'May', cases: 31, margin: 85230, revenue: 141020 }
    ],
    payerMix: [
      { name: 'Commercial', value: 12, revenue: 60000, margin: 42000, color: 'var(--color-blue)' },
      { name: 'Medicare', value: 16, revenue: 73020, margin: 39230, color: 'var(--color-green)' },
      { name: 'Self-Pay', value: 3, revenue: 8000, margin: 4000, color: 'var(--color-orange)' }
    ],
    supplyWaste: [
      { item: 'Ophthalmic Irrigator Disposable', opened: 4, used: 2, wasteCost: 180, type: 'Disposable' },
      { item: 'Suture Silk 4-0', opened: 8, used: 4, wasteCost: 65, type: 'Suture' }
    ],
    recentCancellations: [],
    aiInsights: [
      { id: 1, type: 'med', icon: '⚡', title: 'High Turnover Performance', desc: 'Average turnover is 16 mins (ASC average is 24 mins). Highly efficient scheduling slot fit.' }
    ],
    cptBreakdown: [
      { code: '66984', desc: 'Cataract Removal / Implant', cases: 22, avgTime: 44, margin: 65450 },
      { code: '63030', desc: 'Carpal Tunnel Release', cases: 9, avgTime: 58, margin: 19780 }
    ]
  }
};

const _MOCK_CASE_DIST = [
  { name: 'Highly Profitable (>$1,000)', value: 350, percentage: 28, color: 'var(--color-green)' },
  { name: 'Profitable ($200-$1,000)', value: 449, percentage: 36, color: 'var(--color-blue)' },
  { name: 'Break Even ($0-$200)', value: 200, percentage: 16, color: 'var(--color-orange)' },
  { name: 'Unprofitable (<$0)', value: 249, percentage: 20, color: 'var(--color-red)' }
];

const MOCK_SUPPLY_BREAKDOWN = [
  { name: 'Implants', value: 129185, percentage: 39, color: 'var(--color-blue)' },
  { name: 'Medical Supplies', value: 92145, percentage: 28, color: 'var(--color-green)' },
  { name: 'Pharmaceuticals', value: 49420, percentage: 15, color: 'var(--color-purple)' },
  { name: 'Sutures & Disposables', value: 32970, percentage: 10, color: 'var(--color-pink)' },
  { name: 'Other', value: 26985, percentage: 8, color: 'var(--color-red)' }
];

const _MOCK_PROFITABILITY_SUMMARY = [
  { location: 'Main ASC', cases: 856, rev: 1102450, cost: 1000936, margin: 101514, marginPct: 9.2, util: 64.2, profUtil: 52.1, revHour: 1145, marginHour: 214, trend: 'up' },
  { location: 'South ASC', cases: 392, rev: 482750, cost: 446210, margin: 36540, marginPct: 7.6, util: 58.7, profUtil: 48.3, revHour: 1028, marginHour: 178, trend: 'up' },
  { location: 'West ASC', cases: 286, rev: 312890, cost: 287680, margin: 25210, marginPct: 8.1, util: 61.3, profUtil: 50.2, revHour: 1056, marginHour: 192, trend: 'up' }
];

// Legacy Timeline data (for Schedule Optimizer subtabs)
const INITIAL_SURGERIES = [
  { id: 1, date: '2026-02-24', or: 'OR 1', label: 'Total Knee', doctor: 'Dr. Malinoski', start: '7:30 AM', end: '9:30 AM', startMin: 450, endMin: 570, marginType: 'high', code: '27130', revenue: 22125, supplies: 4800, implants: 6200, labor: 1800, roomCost: 1360, margin: 7965 },
  { id: 2, date: '2026-02-24', or: 'OR 1', label: 'Shoulder Arthroscopy', doctor: 'Dr. Jones', start: '10:00 AM', end: '11:30 AM', startMin: 600, endMin: 690, marginType: 'med', code: '29824', revenue: 11230, supplies: 2400, implants: 2800, labor: 1350, roomCost: 2480, margin: 4200 },
  { id: 3, date: '2026-02-24', or: 'OR 1', label: 'Hip Replacement', doctor: 'Dr. Bonett', start: '12:30 PM', end: '3:00 PM', startMin: 750, endMin: 900, marginType: 'high', code: '27132', revenue: 25400, supplies: 5100, implants: 7500, labor: 2250, roomCost: 3100, margin: 7450 },
  { id: 4, date: '2026-02-24', or: 'OR 1', label: 'Block', doctor: 'System Block', start: '3:30 PM', end: '5:00 PM', startMin: 930, endMin: 1020, marginType: 'blocked' },

  { id: 5, date: '2026-02-24', or: 'OR 2', label: 'Cataract', doctor: 'Dr. Gardner', start: '7:00 AM', end: '8:00 AM', startMin: 420, endMin: 480, marginType: 'med', code: '66984', revenue: 4550, supplies: 950, implants: 1100, labor: 900, roomCost: 800, margin: 800 },
  { id: 6, date: '2026-02-24', or: 'OR 2', label: 'Cataract', doctor: 'Dr. Gardner', start: '8:30 AM', end: '9:30 AM', startMin: 510, endMin: 570, marginType: 'med', code: '66984', revenue: 4550, supplies: 950, implants: 1100, labor: 900, roomCost: 800, margin: 800 },
  { id: 7, date: '2026-02-24', or: 'OR 2', label: 'Cataract', doctor: 'Dr. Gardner', start: '10:00 AM', end: '11:00 AM', startMin: 600, endMin: 660, marginType: 'high', code: '27447', revenue: 9105, supplies: 1450, implants: 1600, labor: 900, roomCost: 2450, margin: 4910 },
  { id: 8, date: '2026-02-24', or: 'OR 2', label: 'Cataract', doctor: 'Dr. Gardner', start: '11:30 AM', end: '12:30 PM', startMin: 690, endMin: 750, marginType: 'low', code: '66984', revenue: 4550, supplies: 1550, implants: 1100, labor: 900, roomCost: 800, margin: 200 },
  { id: 9, date: '2026-02-24', or: 'OR 2', label: 'Cataract', doctor: 'Dr. Walsh', start: '1:00 PM', end: '2:00 PM', startMin: 780, endMin: 840, marginType: 'med', code: '66984', revenue: 4550, supplies: 950, implants: 1100, labor: 900, roomCost: 800, margin: 800 },
  { id: 10, date: '2026-02-24', or: 'OR 2', label: 'Block', doctor: 'System Block', start: '2:30 PM', end: '5:00 PM', startMin: 870, endMin: 1020, marginType: 'blocked' },

  { id: 11, date: '2026-02-24', or: 'OR 3', label: 'Hernia Repair', doctor: 'Dr. Walsh', start: '7:15 AM', end: '8:45 AM', startMin: 435, endMin: 525, marginType: 'high', code: '49505', revenue: 10200, supplies: 1200, implants: 1800, labor: 1350, roomCost: 2100, margin: 3750 },
  { id: 12, date: '2026-02-24', or: 'OR 3', label: 'Gallbladder', doctor: 'Dr. Walsh', start: '9:15 AM', end: '10:45 AM', startMin: 555, endMin: 645, marginType: 'med', code: '23430', revenue: 8732, supplies: 1900, implants: 1100, labor: 1350, roomCost: 2450, margin: 3450 },
  { id: 13, date: '2026-02-24', or: 'OR 3', label: 'Hernia Repair', doctor: 'Dr. Walsh', start: '11:15 AM', end: '12:45 PM', startMin: 675, endMin: 765, marginType: 'med', code: '49505', revenue: 10200, supplies: 2100, implants: 1800, labor: 1350, roomCost: 2100, margin: 2850 },
  { id: 14, date: '2026-02-24', or: 'OR 3', label: 'Appendectomy', doctor: 'Dr. Walsh', start: '1:15 PM', end: '2:45 PM', startMin: 795, endMin: 885, marginType: 'med', code: '44970', revenue: 12400, supplies: 2200, implants: 2500, labor: 1350, roomCost: 3100, margin: 3250 },
  { id: 15, date: '2026-02-24', or: 'OR 3', label: 'Block', doctor: 'System Block', start: '3:15 PM', end: '5:00 PM', startMin: 915, endMin: 1020, marginType: 'blocked' },

  { id: 16, date: '2026-02-24', or: 'OR 4', label: 'Block', doctor: 'System Block', start: '7:00 AM', end: '10:00 AM', startMin: 420, endMin: 600, marginType: 'blocked' },
  { id: 17, date: '2026-02-24', or: 'OR 4', label: 'Spine Fusion', doctor: 'Dr. Bonett', start: '10:30 AM', end: '1:30 PM', startMin: 630, endMin: 810, marginType: 'high', code: '22612', revenue: 42800, supplies: 7500, implants: 18500, labor: 2700, roomCost: 4500, margin: 9600 },
  { id: 18, date: '2026-02-24', or: 'OR 4', label: 'Block', doctor: 'System Block', start: '2:00 PM', end: '5:00 PM', startMin: 840, endMin: 1020, marginType: 'blocked' },
  { id: 19, date: '2026-02-24', or: 'OR 5', label: 'Knee Scope', doctor: 'Dr. Malinoski', start: '7:30 AM', end: '8:30 AM', startMin: 450, endMin: 510, marginType: 'high', code: '29827', revenue: 12842, supplies: 3400, implants: 1819, labor: 900, roomCost: 900, margin: 5823 },
  { id: 20, date: '2026-02-24', or: 'OR 5', label: 'Knee Scope', doctor: 'Dr. Malinoski', start: '9:00 AM', end: '10:00 AM', startMin: 540, endMin: 600, marginType: 'high', code: '29827', revenue: 12842, supplies: 3400, implants: 1819, labor: 900, roomCost: 900, margin: 5823 },
  { id: 21, date: '2026-02-24', or: 'OR 5', label: 'Knee Scope', doctor: 'Dr. Malinoski', start: '10:30 AM', end: '11:30 AM', startMin: 630, endMin: 690, marginType: 'high', code: '29827', revenue: 12842, supplies: 3400, implants: 1819, labor: 900, roomCost: 900, margin: 5823 },
  { id: 22, date: '2026-02-24', or: 'OR 5', label: 'Knee Scope', doctor: 'Dr. Malinoski', start: '12:00 PM', end: '1:00 PM', startMin: 720, endMin: 780, marginType: 'high', code: '29827', revenue: 12842, supplies: 3400, implants: 1819, labor: 900, roomCost: 900, margin: 5823 },
  { id: 23, date: '2026-02-24', or: 'OR 5', label: 'Block', doctor: 'System Block', start: '1:30 PM', end: '5:00 PM', startMin: 810, endMin: 1020, marginType: 'blocked' },

  { id: 24, date: '2026-02-24', or: 'OR 6', label: 'Block / Unavailable', doctor: 'Maintenance', start: '7:00 AM', end: '5:00 PM', startMin: 420, endMin: 1020, marginType: 'blocked' }
];

const WAITLIST_CASES = [
  { id: 101, code: '29827', desc: 'Knee Scope / Arthroscopy', surgeon: 'Dr. Malinoski Kelly', duration: 60, rev: 12842, supplies: 3400, implants: 1819, labor: 900, room: 900, margin: 5823 },
  { id: 102, code: '27447', desc: 'Total Knee Joint Repair', surgeon: 'Dr. Gardner Paul', duration: 90, rev: 21105, supplies: 4500, implants: 6000, labor: 1350, room: 1350, margin: 7905 },
  { id: 103, code: '63030', desc: 'Carpal Tunnel Release', surgeon: 'Dr. Bonett Andrew', duration: 45, rev: 3420, supplies: 850, implants: 0, labor: 675, room: 675, margin: 1220 }
];

const PREFERENCE_CARDS = [
  {
    procedure: 'Knee Arthroscopy (CPT 29827)',
    standardCost: 1200,
    items: [
      { name: 'Knee Pack', qty: 1, cost: 120 },
      { name: 'Arthroscopic Blade', qty: 1, cost: 85 },
      { name: 'Disposable Cannula Set', qty: 1, cost: 145 },
      { name: 'Sutures & Anchors', qty: 2, cost: 450 },
      { name: 'Irrigation Fluid (3L)', qty: 4, cost: 80 },
      { name: 'Miscellaneous Drapes/Gowns', qty: 1, cost: 320 }
    ],
    surgeons: [
      { name: 'Dr. Malinoski Kelly', actualCost: 1450, variance: 20.8, supplyItems: 8 },
      { name: 'Dr. Bonett Andrew', actualCost: 1180, variance: -1.7, supplyItems: 5 },
      { name: 'Dr. Walsh Mark', actualCost: 1620, variance: 35.0, supplyItems: 10 }
    ]
  }
];

const MOCK_PATIENTS = [
  {
    id: 1,
    name: "GARON, SUZANNE",
    dob: "1960-11-15",
    mrn: "2034",
    phone: "2397784568",
    email: "suzimail@me.com",
    address: "7793 Hawthorne Drive #2904",
    insurance_provider: "UnitedHealthcare",
    insurance_policy_number: "UHC-2034091",
    gender: "Female"
  },
  {
    id: 2,
    name: "SMITH, JOHNATHAN",
    dob: "1975-04-22",
    mrn: "1052",
    phone: "3125550198",
    email: "jsmith75@outlook.com",
    address: "415 Pine Street",
    insurance_provider: "Blue Cross Blue Shield",
    insurance_policy_number: "BCBS-8839201",
    gender: "Male"
  },
  {
    id: 3,
    name: "RODRIGUEZ, MARIA",
    dob: "1988-09-02",
    mrn: "4491",
    phone: "7185558392",
    email: "m.rodriguez@gmail.com",
    address: "882 Broadway Apt 4B",
    insurance_provider: "Aetna",
    insurance_policy_number: "AET-3301928",
    gender: "Female"
  },
  {
    id: 4,
    name: "DAVIS, ROBERT",
    dob: "1952-12-30",
    mrn: "3029",
    phone: "4155552093",
    email: "robbied@sbcglobal.net",
    address: "1225 Oak Lane",
    insurance_provider: "Cigna",
    insurance_policy_number: "CIG-9041283",
    gender: "Male"
  }
];

// ==========================================
// COMPONENT: SURGEON PROFILE PAGE
// ==========================================
function SurgeonProfilePage({ surgeonName, onBack, activeProfileTab, setActiveProfileTab, surgeonsDetails }) {
  const surg = surgeonsDetails[surgeonName];
  if (!surg) {
    return (
      <div className="dashboard-card" style={{ padding: '24px', textAlign: 'center' }}>
        <h3>Surgeon profile data not found.</h3>
        <button className="btn-header" onClick={onBack} style={{ marginTop: '12px' }}>Go Back</button>
      </div>
    );
  }

  return (
    <div className="surgeon-profile-page" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Back link */}
      <div>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-blue)',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '0'
          }}
        >
          ← Back to Surgeon Performance
        </button>
      </div>

      {/* Header Info Card */}
      <div className="surgeon-profile-header-card" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px' }}>
        <div style={{ display: 'flex', gap: '16px', borderRight: '1px solid var(--border-light)', paddingRight: '24px' }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '12px',
            backgroundImage: `url(${surg.avatar})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            border: '2px solid var(--border-color)',
            flexShrink: 0
          }}></div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-blue)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{surg.specialty}</span>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', fontWeight: '700', margin: '2px 0 4px 0' }}>{surg.name}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="status-badge active" style={{ fontSize: '0.65rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-green)', padding: '2px 8px', borderRadius: '12px', fontWeight: '600' }}>{surg.status}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>NPI: {surg.npi}</span>
            </div>
          </div>
        </div>

        {/* Small KPIs right side */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', alignItems: 'center' }}>
          <div className="profile-mini-kpi" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>Cases Done (MTD)</span>
            <span style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--text-primary)' }}>{surg.metrics.cases}</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--color-green)', fontWeight: '600' }}>#1 in caseload</span>
          </div>

          <div className="profile-mini-kpi" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>Avg Turnover</span>
            <span style={{ fontSize: '1.4rem', fontWeight: '700', color: surg.metrics.avgTurnover > 20 ? 'var(--color-orange)' : '#fff' }}>{surg.metrics.avgTurnover} mins</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>vs facility avg 24m</span>
          </div>

          <div className="profile-mini-kpi" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>Supply Variance</span>
            <span style={{ fontSize: '1.4rem', fontWeight: '700', color: surg.metrics.supplyVariance.startsWith('+') ? 'var(--color-red)' : 'var(--color-green)' }}>{surg.metrics.supplyVariance}</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Standard card base $1,200</span>
          </div>

          <div className="profile-mini-kpi" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>Net Margin (MTD)</span>
            <span style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--color-green)' }}>${surg.metrics.netMargin.toLocaleString()}</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Avg ${surg.metrics.avgMargin}/case</span>
          </div>
        </div>
      </div>

      {/* Inner tabs horizontal menu */}
      <div className="subtabs-menu" style={{ marginBottom: '0' }}>
        <button className={`subtab-item ${activeProfileTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveProfileTab('overview')}>Overview</button>
        <button className={`subtab-item ${activeProfileTab === 'financials' ? 'active' : ''}`} onClick={() => setActiveProfileTab('financials')}>Financials & CPTs</button>
        <button className={`subtab-item ${activeProfileTab === 'payer' ? 'active' : ''}`} onClick={() => setActiveProfileTab('payer')}>Payer Mix</button>
        <button className={`subtab-item ${activeProfileTab === 'supply' ? 'active' : ''}`} onClick={() => setActiveProfileTab('supply')}>Supply Card Audit</button>
        <button className={`subtab-item ${activeProfileTab === 'schedule' ? 'active' : ''}`} onClick={() => setActiveProfileTab('schedule')}>OR Blocks & Cancellations</button>
        <button className={`subtab-item ${activeProfileTab === 'ai' ? 'active' : ''}`} onClick={() => setActiveProfileTab('ai')}>AI Recommendations ({surg.aiInsights.length})</button>
      </div>

      {/* Profile Page Tab Content */}
      <div className="profile-tab-content" style={{ marginTop: '10px' }}>

        {/* ==========================================
            SUB-TAB: OVERVIEW
            ========================================== */}
        {activeProfileTab === 'overview' && (
          <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }}>

            {/* Historical trend chart */}
            <div className="dashboard-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card-header">
                <h3 className="card-title">Cases & Margin Trend (Jan - May)</h3>
              </div>
              <div style={{ width: '100%', height: '260px', marginTop: '10px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={surg.caseHistory} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                    <XAxis dataKey="name" stroke="#5e6c84" fontSize={10} tickLine={false} />
                    <YAxis yAxisId="left" stroke="var(--color-blue)" fontSize={10} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" stroke="var(--color-green)" fontSize={10} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', fontSize: '11px', color: 'var(--text-primary)' }} />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="cases" stroke="var(--color-blue)" strokeWidth={2.5} name="Cases Done" dot={{ r: 4 }} />
                    <Line yAxisId="right" type="monotone" dataKey="margin" stroke="var(--color-green)" strokeWidth={2.5} name="Net Margin ($)" dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Operational Benchmarks */}
            <div className="dashboard-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="card-header">
                <h3 className="card-title">Operational Efficiency Benchmarks</h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Benchmark 1 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Avg Procedure Duration</span>
                    <span style={{ fontWeight: '600' }}>{surg.metrics.avgDuration} mins <span style={{ color: surg.metrics.avgDuration > 64 ? 'var(--color-red)' : 'var(--color-green)', fontSize: '0.75rem' }}>({surg.metrics.avgDuration > 64 ? '+' : ''}{surg.metrics.avgDuration - 64}m vs facility avg 64m)</span></span>
                  </div>
                  <div style={{ height: '8px', width: '100%', backgroundColor: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, (surg.metrics.avgDuration / 120) * 100)}%`, backgroundColor: surg.metrics.avgDuration > 64 ? 'var(--color-orange)' : 'var(--color-green)' }} />
                    <div style={{ position: 'absolute', left: `${(64 / 120) * 100}%`, top: '0', bottom: '0', width: '2px', backgroundColor: '#fff', opacity: '0.6' }} title="Facility Average" />
                  </div>
                </div>

                {/* Benchmark 2 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Avg Room Turnover Time</span>
                    <span style={{ fontWeight: '600' }}>{surg.metrics.avgTurnover} mins <span style={{ color: surg.metrics.avgTurnover > 24 ? 'var(--color-red)' : 'var(--color-green)', fontSize: '0.75rem' }}>({surg.metrics.avgTurnover > 24 ? '+' : ''}{surg.metrics.avgTurnover - 24}m vs facility avg 24m)</span></span>
                  </div>
                  <div style={{ height: '8px', width: '100%', backgroundColor: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, (surg.metrics.avgTurnover / 45) * 100)}%`, backgroundColor: surg.metrics.avgTurnover > 24 ? 'var(--color-red)' : 'var(--color-green)' }} />
                    <div style={{ position: 'absolute', left: `${(24 / 45) * 100}%`, top: '0', bottom: '0', width: '2px', backgroundColor: '#fff', opacity: '0.6' }} title="Facility Average" />
                  </div>
                </div>

                {/* Benchmark 3 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>On-Time Case Start Rate</span>
                    <span style={{ fontWeight: '600' }}>{surg.metrics.onTimeStart}% <span style={{ color: surg.metrics.onTimeStart >= 88 ? 'var(--color-green)' : 'var(--color-red)', fontSize: '0.75rem' }}>(Target: 88%)</span></span>
                  </div>
                  <div style={{ height: '8px', width: '100%', backgroundColor: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ height: '100%', width: `${surg.metrics.onTimeStart}%`, backgroundColor: surg.metrics.onTimeStart >= 88 ? 'var(--color-green)' : 'var(--color-orange)' }} />
                  </div>
                </div>

                {/* Benchmark 4 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>OR Block Utilization Rate</span>
                    <span style={{ fontWeight: '600' }}>{surg.metrics.utilization}% <span style={{ color: surg.metrics.utilization >= 70 ? 'var(--color-green)' : 'var(--color-orange)', fontSize: '0.75rem' }}>(Facility avg: 62.4%)</span></span>
                  </div>
                  <div style={{ height: '8px', width: '100%', backgroundColor: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ height: '100%', width: `${surg.metrics.utilization}%`, backgroundColor: 'var(--color-blue)' }} />
                  </div>
                </div>
              </div>

              <div style={{ backgroundColor: 'rgba(59,130,246,0.04)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '12px', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 'auto' }}>
                <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>Operational Summary:</span> Dr. {surg.name.split(' ').pop()} ranks in the **top 10%** for on-time starts. However, turnover overrides represent {surg.metrics.avgTurnover > 20 ? 'a secondary operational hazard' : 'optimal standards, beating facility averages by ' + (24 - surg.metrics.avgTurnover) + ' minutes'}.
              </div>
            </div>

          </div>
        )}

        {/* ==========================================
            SUB-TAB: FINANCIALS & CPTS
            ========================================== */}
        {activeProfileTab === 'financials' && (
          <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.2fr', gap: '20px' }}>

            {/* Financial Ledger card */}
            <div className="dashboard-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card-header">
                <h3 className="card-title">Monthly Ledger (MTD Details)</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.8rem', padding: '10px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-light)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Total Case Revenue</span>
                  <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>${(surg.metrics.netMargin * 2.1).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-light)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Surgical Supplies</span>
                  <span style={{ color: 'var(--color-red)' }}>-${(surg.metrics.netMargin * 0.35).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-light)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Implant Expenditures</span>
                  <span style={{ color: 'var(--color-red)' }}>-${(surg.metrics.netMargin * 0.45).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-light)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Direct Labor Allocation</span>
                  <span style={{ color: 'var(--color-red)' }}>-${(surg.metrics.cases * surg.metrics.avgDuration * 7.5).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-light)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Overhead Facility Allocation</span>
                  <span style={{ color: 'var(--color-red)' }}>-${(surg.metrics.cases * 950).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', fontSize: '0.9rem', fontWeight: '700' }}>
                  <span style={{ color: 'var(--text-primary)' }}>Net Contribution Margin</span>
                  <span style={{ color: 'var(--color-green)' }}>+${surg.metrics.netMargin.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span>EBITDA Margin %</span>
                  <span>{Math.round((surg.metrics.netMargin / (surg.metrics.netMargin * 2.1)) * 100)}%</span>
                </div>
              </div>
            </div>

            {/* CPT Codes Split Table */}
            <div className="dashboard-card">
              <div className="card-header">
                <h3 className="card-title">Profitability by CPT Code</h3>
              </div>
              <div className="custom-table-container" style={{ marginTop: '10px' }}>
                <table className="custom-table" style={{ fontSize: '0.75rem' }}>
                  <thead>
                    <tr>
                      <th>CPT Code</th>
                      <th>Description</th>
                      <th>Cases</th>
                      <th>Avg Duration</th>
                      <th>Contrib. Margin</th>
                      <th>Avg Margin / Case</th>
                    </tr>
                  </thead>
                  <tbody>
                    {surg.cptBreakdown.map(c => (
                      <tr key={c.code}>
                        <td style={{ fontWeight: '700' }}>{c.code}</td>
                        <td>{c.desc}</td>
                        <td>{c.cases}</td>
                        <td>{c.avgTime} mins</td>
                        <td style={{ color: 'var(--color-green)', fontWeight: '600' }}>${c.margin.toLocaleString()}</td>
                        <td style={{ fontWeight: '600' }}>${Math.round(c.margin / c.cases).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* ==========================================
            SUB-TAB: PAYER MIX
            ========================================== */}
        {activeProfileTab === 'payer' && (
          <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: '20px' }}>

            {/* Payer Pie Chart */}
            <div className="dashboard-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className="card-header" style={{ width: '100%' }}>
                <h3 className="card-title">Payer Mix Case Share</h3>
              </div>
              <div style={{ position: 'relative', width: '100%', height: '160px', marginTop: '10px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={surg.payerMix}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={65}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {surg.payerMix.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--text-primary)' }}>{surg.metrics.cases}</div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>Cases</div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '12px' }}>
                {surg.payerMix.map(item => (
                  <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: item.color }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{item.name} ({Math.round(item.value / surg.metrics.cases * 100)}%)</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Payer Profitability Table */}
            <div className="dashboard-card">
              <div className="card-header">
                <h3 className="card-title">Payer Contribution Analysis</h3>
              </div>
              <div className="custom-table-container" style={{ marginTop: '10px' }}>
                <table className="custom-table" style={{ fontSize: '0.75rem' }}>
                  <thead>
                    <tr>
                      <th>Payer Group</th>
                      <th>Cases</th>
                      <th>Estimated Revenue</th>
                      <th>Net Margin</th>
                      <th>Avg Margin %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {surg.payerMix.map(p => (
                      <tr key={p.name}>
                        <td style={{ fontWeight: '600' }}>{p.name}</td>
                        <td>{p.value}</td>
                        <td>${p.revenue.toLocaleString()}</td>
                        <td style={{ color: 'var(--color-green)', fontWeight: '600' }}>${p.margin.toLocaleString()}</td>
                        <td style={{ fontWeight: '600' }}>{Math.round(p.margin / p.revenue * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* ==========================================
            SUB-TAB: SUPPLY CHAIN & PREFERENCE CARDS
            ========================================== */}
        {activeProfileTab === 'supply' && (
          <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.2fr', gap: '20px' }}>

            {/* Preference card audit info */}
            <div className="dashboard-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="card-header">
                <h3 className="card-title">Preference Card Variance</h3>
              </div>

              <div style={{ textAlign: 'center', padding: '16px 0', borderBottom: '1px solid var(--border-light)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Average Cost Deviation</span>
                <h2 style={{ fontSize: '2rem', fontWeight: '700', color: surg.metrics.supplyVariance.startsWith('+') ? 'var(--color-red)' : 'var(--color-green)', margin: '4px 0' }}>{surg.metrics.supplyVariance}</h2>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Baseline Card Standard: $1,200</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Dr. {surg.name.split(' ').pop()}\'s Avg Spend:</span>
                  <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>${Math.round(1200 * (1 + parseFloat(surg.metrics.supplyVariance) / 100))}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Opportunity per case:</span>
                  <span style={{ color: 'var(--color-green)', fontWeight: '600' }}>
                    {parseFloat(surg.metrics.supplyVariance) > 0 ? `$${Math.round(1200 * parseFloat(surg.metrics.supplyVariance) / 100)} saving` : '$0 (Optimal)'}
                  </span>
                </div>
              </div>

              <button
                className="btn-header btn-primary"
                style={{ width: '100%', justifyContent: 'center', marginTop: 'auto' }}
                onClick={() => alert(`Standardization proposal sent to Dr. ${surg.name.split(' ').pop()}.`)}
              >
                Send Standardization Proposal
              </button>
            </div>

            {/* Itemized Waste List */}
            <div className="dashboard-card">
              <div className="card-header">
                <h3 className="card-title">Itemized Open-to-Use Waste Audit</h3>
              </div>
              <div className="custom-table-container" style={{ marginTop: '10px' }}>
                <table className="custom-table" style={{ fontSize: '0.75rem' }}>
                  <thead>
                    <tr>
                      <th>Supply Item Description</th>
                      <th>Category</th>
                      <th>Qty Opened</th>
                      <th>Qty Used</th>
                      <th>Waste Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {surg.supplyWaste.length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>No significant supply waste detected.</td>
                      </tr>
                    ) : surg.supplyWaste.map((w, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: '600' }}>{w.item}</td>
                        <td>{w.type}</td>
                        <td>{w.opened}</td>
                        <td>{w.used}</td>
                        <td style={{ color: w.wasteCost > 0 ? 'var(--color-red)' : 'var(--color-green)', fontWeight: '600' }}>
                          {w.wasteCost > 0 ? `-$${w.wasteCost}` : '$0'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* ==========================================
            SUB-TAB: OR BLOCKS & CANCELLATIONS
            ========================================== */}
        {activeProfileTab === 'schedule' && (
          <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '0.85fr 1.15fr', gap: '20px' }}>

            {/* Block utilization */}
            <div className="dashboard-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="card-header">
                <h3 className="card-title">Block Time Utilization</h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Allocated Block Time</span>
                  <span style={{ fontWeight: '600' }}>40 hours</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Actual OR Time Used</span>
                  <span style={{ fontWeight: '600', color: 'var(--color-green)' }}>31.2 hours</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Wasted / Blank Slots</span>
                  <span style={{ fontWeight: '600', color: 'var(--color-red)' }}>8.8 hours</span>
                </div>

                <div style={{ height: '14px', width: '100%', backgroundColor: 'var(--border-color)', borderRadius: '7px', overflow: 'hidden', display: 'flex', marginTop: '10px' }}>
                  <div style={{ height: '100%', width: '78%', backgroundColor: 'var(--color-blue)' }} title="OR Time Used (78%)" />
                  <div style={{ height: '100%', width: '22%', backgroundColor: 'var(--color-red)' }} title="Wasted Slot Time (22%)" />
                </div>

                <div style={{ display: 'flex', gap: '12px', fontSize: '0.7rem', marginTop: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: 'var(--color-blue)' }} />
                    <span>Used (78%)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: 'var(--color-red)' }} />
                    <span>Wasted block (22%)</span>
                  </div>
                </div>
              </div>

              <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.05)', border: '1px dashed var(--color-red)', borderRadius: '6px', padding: '12px', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 'auto' }}>
                <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>Block Leakage Opportunity:</span> Releasing the last 2 hours of blocks on Wednesday afternoons (which are historically unused) could prevent $3,200 in staff allocation losses.
              </div>
            </div>

            {/* Cancellations Log */}
            <div className="dashboard-card">
              <div className="card-header">
                <h3 className="card-title">Cancellations & Lost Margin</h3>
              </div>
              <div className="custom-table-container" style={{ marginTop: '10px' }}>
                <table className="custom-table" style={{ fontSize: '0.75rem' }}>
                  <thead>
                    <tr>
                      <th>Cancellation Date</th>
                      <th>Scheduled CPT</th>
                      <th>Primary Reason</th>
                      <th>Lost Contribution Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {surg.recentCancellations.length === 0 ? (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '36px 0' }}>No cancellations recorded for Dr. {surg.name.split(' ').pop()} this month.</td>
                      </tr>
                    ) : surg.recentCancellations.map((c, idx) => (
                      <tr key={idx}>
                        <td>{c.date}</td>
                        <td style={{ fontWeight: '600' }}>{c.procedure}</td>
                        <td style={{ color: 'var(--color-orange)' }}>{c.reason}</td>
                        <td style={{ color: 'var(--color-red)', fontWeight: '600' }}>-${c.loss.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* ==========================================
            SUB-TAB: AI INSIGHTS
            ========================================== */}
        {activeProfileTab === 'ai' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>Prescriptive Practice Recommendations</h3>

            {surg.aiInsights.map((insight, _idx) => (
              <div
                key={insight.id}
                style={{
                  display: 'flex',
                  gap: '16px',
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderLeft: `4px solid ${insight.type === 'high' ? 'var(--color-red)' : 'var(--color-blue)'}`,
                  borderRadius: '6px',
                  padding: '16px'
                }}
              >
                <div style={{ fontSize: '1.5rem' }}>{insight.icon}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.9rem' }}>{insight.title}</span>
                    <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: '3px', fontWeight: '700', textTransform: 'uppercase', backgroundColor: insight.type === 'high' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)', color: insight.type === 'high' ? 'var(--color-red)' : 'var(--color-blue)' }}>{insight.type} priority</span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0' }}>{insight.desc}</p>
                </div>
                <button
                  className="btn-header btn-primary"
                  style={{ alignSelf: 'center', padding: '4px 12px', fontSize: '0.75rem' }}
                  onClick={() => alert(`Recommendation applied: ${insight.title}`)}
                >
                  Apply Recommendation
                </button>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

const _MOCK_SPECIALTY_DIST = [
  { name: 'Orthopedics', value: 580, percentage: 38, revenue: 1102450, margin: 468450, color: 'var(--color-blue)' },
  { name: 'Ophthalmology', value: 450, percentage: 29, revenue: 327780, margin: 215630, color: 'var(--color-green)' },
  { name: 'Spine Surgery', value: 180, percentage: 12, revenue: 531200, margin: 157850, color: 'var(--color-purple)' },
  { name: 'General Surgery', value: 240, percentage: 16, revenue: 418300, margin: 142910, color: 'var(--color-orange)' },
  { name: 'Gynecology', value: 84, percentage: 5, revenue: 141020, margin: 85230, color: 'var(--color-pink)' }
];


const _MOCK_FACILITY_COMPARATIVE = [
  { name: 'Main ASC', cases: 856, util: 64.2, profitUtil: 52.1, revenue: 1102450, directCost: 1000936, netMargin: 101514, cancellations: 6 },
  { name: 'South ASC', cases: 392, util: 58.7, profitUtil: 48.3, revenue: 482750, directCost: 446210, netMargin: 36540, cancellations: 4 },
  { name: 'West ASC', cases: 286, util: 61.3, profitUtil: 50.2, revenue: 312890, directCost: 287680, netMargin: 25210, cancellations: 2 }
];

const MOCK_OR_ROOT_CAUSES_PIE = [
  { name: 'Late Starts', value: 32, percentage: 32, color: 'var(--color-blue)' },
  { name: 'Turnovers', value: 26, percentage: 26, color: 'var(--color-red)' },
  { name: 'Spacing Gaps', value: 22, percentage: 22, color: 'var(--color-green)' },
  { name: 'Unfilled Blocks', value: 20, percentage: 20, color: 'var(--color-orange)' }
];

const MOCK_OR_BLOCK_ALLOC_PIE = [
  { name: 'Utilized Blocks', value: 68, percentage: 68, color: 'var(--color-green)' },
  { name: 'Released Blocks', value: 18, percentage: 18, color: 'var(--color-blue)' },
  { name: 'Wasted Blocks', value: 14, percentage: 14, color: 'var(--color-red)' }
];

const MOCK_OR_TURNOVER_EFF_PIE = [
  { name: 'Optimal (<20m)', value: 55, percentage: 55, color: 'var(--color-green)' },
  { name: 'Standard (20-30m)', value: 30, percentage: 30, color: 'var(--color-blue)' },
  { name: 'Excessive (>30m)', value: 15, percentage: 15, color: 'var(--color-red)' }
];
const CustomDateInput = React.forwardRef(({ value, onClick }, ref) => (
  <div onClick={onClick} ref={ref} style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
    <span style={{ marginRight: '10px' }}>{value}</span>
    <CalendarDays size={16} />
  </div>
));
CustomDateInput.displayName = 'CustomDateInput';

export default function App() {
  const [authUser, setAuthUser] = useState(() => db.getSession());
  const userRole = rbacService.normalizeRole(authUser?.role);
  const canViewPHI = ['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'scheduler', 'surgeon', 'biller', 'coder'].includes(userRole);

  // Phase 25: Secure Session Logout & Storage Purge
  const handleLogout = React.useCallback((reason = 'USER_INITIATED') => {
    if (authUser) {
      db.logAuditEvent({
        action: 'LOGOUT',
        table_name: 'facility_memberships',
        record_id: authUser?.id ? String(authUser.id) : 'session',
        source: reason === 'INACTIVITY_TIMEOUT' ? 'SYSTEM' : 'UI',
        change_reason: reason === 'INACTIVITY_TIMEOUT'
          ? 'Automatic session termination due to 15-minute inactivity (HIPAA § 164.312(a)(2)(iii))'
          : 'User initiated secure session sign-out'
      }).catch(() => {});
    }
    db.clearSession();
    try {
      localStorage.removeItem('caseLogSchedulerState');
    } catch {
      // ignore
    }
    setAuthUser(null);
  }, [authUser]);

  // Phase 25: HIPAA § 164.312(a)(2)(iii) Inactivity Auto-Logoff Handler
  const handleSessionTimeout = React.useCallback(() => {
    handleLogout('INACTIVITY_TIMEOUT');
    Swal.fire({
      title: 'Session Expired',
      text: 'In compliance with HIPAA Technical Safeguards (45 CFR § 164.312), your session was automatically logged out due to 15 minutes of inactivity to protect patient records.',
      icon: 'info',
      background: 'var(--bg-card)',
      color: 'var(--text-primary)'
    });
  }, [handleLogout]);

  const { showWarning: showInactivityWarning, remainingSeconds: inactivitySeconds, resetTimer: resetInactivityTimer } = useInactivityTimeout({
    timeoutMs: 15 * 60 * 1000,
    warningMs: 60 * 1000,
    onTimeout: handleSessionTimeout,
    enabled: Boolean(authUser)
  });

  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = React.useRef(null);

  const getInitials = (nameStr) => {
    if (!nameStr) return 'AD';
    const parts = nameStr.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    return nameStr.slice(0, 2).toUpperCase();
  };

  const [facilities, setFacilities] = useState(DEFAULT_FACILITIES);
  const [activeFacility, setActiveFacility] = useState(() => db.getActiveFacility());
  const [facilityDropdownOpen, setFacilityDropdownOpen] = useState(false);
  const facilityMenuRef = React.useRef(null);

  useEffect(() => {
    async function loadFacilities() {
      if (!authUser) return;
      const list = await db.getFacilities();
      if (list && list.length > 0) {
        setFacilities(list);
        const current = db.getActiveFacility();
        const found = list.find(f => f.id === current?.id);
        if (found) {
          setActiveFacility(found);
        } else {
          setActiveFacility(list[0]);
          db.setActiveFacility(list[0]);
        }
      }
    }
    loadFacilities();
  }, [authUser]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target)) {
        setAccountMenuOpen(false);
      }
      if (facilityMenuRef.current && !facilityMenuRef.current.contains(e.target)) {
        setFacilityDropdownOpen(false);
      }
    };
    if (accountMenuOpen || facilityDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [accountMenuOpen, facilityDropdownOpen]);

  const [activeTab, setActiveTab] = useState('dashboard');
  const [timeFilter, setTimeFilter] = useState('All');
  const [filterDate, setFilterDate] = useState(new Date('2026-02-23T12:00:00'));
  const [surgeries, setSurgeries] = useState(INITIAL_SURGERIES);
  const includeAdvancedCosts = false;
  const [theme, setTheme] = useState(() => localStorage.getItem('asc_theme') || 'light');

  useEffect(() => {
    const applyThemeColors = () => {
      const isDark = theme === 'dark';
      const sidebarColor = localStorage.getItem(isDark ? 'dark_sidebar_color' : 'light_sidebar_color');
      const bgColor = localStorage.getItem(isDark ? 'dark_bg_color' : 'light_bg_color');
      const textColor = localStorage.getItem(isDark ? 'dark_text_color' : 'light_text_color');
      const labelColor = localStorage.getItem(isDark ? 'dark_label_color' : 'light_label_color');
      const portalColor = localStorage.getItem(isDark ? 'dark_portal_color' : 'light_portal_color');

      if (sidebarColor) document.documentElement.style.setProperty('--bg-sidebar', sidebarColor);
      else document.documentElement.style.removeProperty('--bg-sidebar');

      if (bgColor) document.documentElement.style.setProperty('--bg-main', bgColor);
      else document.documentElement.style.removeProperty('--bg-main');

      if (textColor) {
        document.documentElement.style.setProperty('--text-primary', textColor);
        document.documentElement.style.setProperty('--text-color', textColor);
      } else {
        document.documentElement.style.removeProperty('--text-primary');
        document.documentElement.style.removeProperty('--text-color');
      }

      if (labelColor) document.documentElement.style.setProperty('--text-secondary', labelColor);
      else document.documentElement.style.removeProperty('--text-secondary');

      if (portalColor) document.documentElement.style.setProperty('--bg-card', portalColor);
      else document.documentElement.style.removeProperty('--bg-card');
    };

    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('asc_theme', theme);
    applyThemeColors();

    const handleThemeUpdated = () => applyThemeColors();
    window.addEventListener('theme-updated', handleThemeUpdated);
    
    return () => window.removeEventListener('theme-updated', handleThemeUpdated);
  }, [theme]);

  const isDateInFilter = React.useCallback((surgDateStr, fDate, tFilter) => {
    if (tFilter === 'All') return true;
    if (!surgDateStr || !fDate) return true;
    // Handle different possible date formats, defaulting to YYYY-MM-DD
    const [y, m, d] = surgDateStr.includes('-') ? surgDateStr.split('-').map(Number) : [null, null, null];
    let surgDate;
    if (y && m && d) surgDate = new Date(y, m - 1, d);
    else surgDate = new Date(surgDateStr + 'T12:00:00');

    if (isNaN(surgDate)) return false;

    if (tFilter === 'Day') {
      return surgDate.getFullYear() === fDate.getFullYear() &&
        surgDate.getMonth() === fDate.getMonth() &&
        surgDate.getDate() === fDate.getDate();
    } else if (tFilter === 'Month') {
      return surgDate.getFullYear() === fDate.getFullYear() &&
        surgDate.getMonth() === fDate.getMonth();
    } else if (tFilter === 'Year') {
      return surgDate.getFullYear() === fDate.getFullYear();
    } else if (tFilter === 'Week') {
      const startOfWeek = new Date(fDate);
      startOfWeek.setHours(0, 0, 0, 0);
      // Ensure startOfWeek is Monday
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      return surgDate >= startOfWeek && surgDate <= endOfWeek;
    }
    return true;
  }, []);

  const filteredSurgeries = React.useMemo(() => surgeries.filter(s => isDateInFilter(s.date, filterDate, timeFilter)), [surgeries, filterDate, timeFilter, isDateInFilter]);

  const orPerformanceMetrics = React.useMemo(() => {
    let totalTurnover = 0;
    let turnoverCount = 0;
    let gapsCount = 0;
    let overtimeMinutes = 0;
    let overtimeCases = 0;
    let totalLeakageMinutes = 0;
    let cancelledMinutes = 0;
    const roomUtilization = {};

    if (!filteredSurgeries || filteredSurgeries.length === 0) {
      return {
        avgTurnover: 0,
        leakageHrs: '0.0',
        ovHrs: '0.0',
        gaps: 0,
        overtimeCases: 0,
        turnoverCount: 0,
        operatingDaysCount: 0,
        roomUtilization: [],
        rootCauses: [],
        rootCausesPie: [],
        blockAllocPie: [],
        turnoverEffPie: []
      };
    }

    const byDateAndOR = {};
    const datesSet = new Set();
    let optTurnover = 0, stdTurnover = 0, excTurnover = 0;
    let lateStartsMins = 0, turnoverOverrunMins = 0;

    filteredSurgeries.forEach(surg => {
      let or = (surg.or_room || surg.or || 'OR 1').toString().trim();
      if (/^\d+$/.test(or)) or = 'OR ' + or;
      if (!or) return;

      const date = surg.date || 'unknown';
      if (date !== 'unknown') datesSet.add(date);

      if (!byDateAndOR[date]) byDateAndOR[date] = {};
      if (!byDateAndOR[date][or]) byDateAndOR[date][or] = [];
      byDateAndOR[date][or].push(surg);

      const dur = parseInt(surg.actual_duration_minutes || surg.duration_minutes || 60, 10);
      const schedDur = parseInt(surg.duration_minutes || 60, 10);

      if (surg.status?.toLowerCase() === 'cancelled') {
        cancelledMinutes += schedDur;
        return;
      }

      let turnover = 20;
      if (surg.turnover_time !== undefined && surg.turnover_time !== null && !isNaN(surg.turnover_time)) {
        turnover = parseInt(surg.turnover_time, 10);
      } else if (surg.turnoverTime !== undefined && !isNaN(surg.turnoverTime)) {
        turnover = parseInt(surg.turnoverTime, 10);
      }
      totalTurnover += turnover;
      turnoverCount++;

      if (turnover < 20) optTurnover++;
      else if (turnover <= 30) stdTurnover++;
      else {
        excTurnover++;
        turnoverOverrunMins += (turnover - 20);
      }

      if (surg.actual_start_time && surg.start_time && surg.actual_start_time > surg.start_time) {
        lateStartsMins += 15;
      } else if (turnoverCount % 3 === 0) {
        lateStartsMins += 10;
      }

      if (dur > schedDur) {
        overtimeMinutes += (dur - schedDur);
        overtimeCases++;
      }

      if (!roomUtilization[or]) {
        roomUtilization[or] = { used: 0, days: new Set() };
      }
      roomUtilization[or].used += dur;
      if (date !== 'unknown') roomUtilization[or].days.add(date);
    });

    Object.values(byDateAndOR).forEach(orGroups => {
      Object.values(orGroups).forEach(slist => {
        const activeSurgeries = slist.filter(s => s.status?.toLowerCase() !== 'cancelled');
        if (activeSurgeries.length > 1) {
          gapsCount += activeSurgeries.length - 1;
          totalLeakageMinutes += (activeSurgeries.length - 1) * 35;
        }
      });
    });

    const avgTurnover = turnoverCount ? Math.round(totalTurnover / turnoverCount) : 0;
    const leakageHrs = (totalLeakageMinutes / 60).toFixed(1);
    const ovHrs = (overtimeMinutes / 60).toFixed(1);

    const utlizationArray = Object.keys(roomUtilization).map(or => {
      const data = roomUtilization[or];
      const distinctDays = Math.max(1, data.days.size);
      const totalAvail = distinctDays * 480;
      let pct = Math.min(100, Math.round((data.used / totalAvail) * 100));
      return {
        room: or,
        val: pct,
        color: pct > 75 ? 'var(--color-blue)' : (pct > 45 ? 'var(--color-green)' : 'var(--color-orange)')
      };
    }).sort((a, b) => a.room.localeCompare(b.room));

    const totalWastageMins = lateStartsMins + turnoverOverrunMins + totalLeakageMinutes + 120;
    const latePct = Math.round((lateStartsMins / (totalWastageMins || 1)) * 100) || 28;
    const turnPct = Math.round((turnoverOverrunMins / (totalWastageMins || 1)) * 100) || 24;
    const gapsPct = Math.round((totalLeakageMinutes / (totalWastageMins || 1)) * 100) || 26;
    const unfilledPct = Math.max(0, 100 - latePct - turnPct - gapsPct);

    const rootCauses = [
      { name: 'Late Starts (Surgeon delay)', pct: latePct, color: 'var(--color-blue)' },
      { name: 'Turnover Overruns (Staff/Clean)', pct: turnPct, color: 'var(--color-red)' },
      { name: 'Short Case Spacing Gaps', pct: gapsPct, color: 'var(--color-green)' },
      { name: 'Unfilled Block Time', pct: unfilledPct, color: 'var(--color-orange)' },
    ];
    const rootCausesPie = [
      { name: 'Late Starts', value: latePct, percentage: latePct, color: 'var(--color-blue)' },
      { name: 'Turnovers', value: turnPct, percentage: turnPct, color: 'var(--color-red)' },
      { name: 'Spacing Gaps', value: gapsPct, percentage: gapsPct, color: 'var(--color-green)' },
      { name: 'Unfilled Blocks', value: unfilledPct, percentage: unfilledPct, color: 'var(--color-orange)' }
    ];

    let totalUsedAll = 0;
    Object.values(roomUtilization).forEach(r => totalUsedAll += r.used);
    const totalAvailAll = Math.max(1, Math.max(datesSet.size, 1) * 480 * Math.max(Object.keys(roomUtilization).length, 1));
    const utilizedPct = Math.min(85, Math.round((totalUsedAll / totalAvailAll) * 100)) || 65;
    const releasedPct = Math.min(25, Math.round((cancelledMinutes / totalAvailAll) * 100)) || 18;
    const wastedPct = Math.max(5, 100 - utilizedPct - releasedPct);

    const blockAllocPie = [
      { name: 'Utilized Blocks', value: utilizedPct, percentage: utilizedPct, color: 'var(--color-green)' },
      { name: 'Released Blocks', value: releasedPct, percentage: releasedPct, color: 'var(--color-blue)' },
      { name: 'Wasted Blocks', value: wastedPct, percentage: wastedPct, color: 'var(--color-red)' }
    ];

    const totalTurnoverCases = (optTurnover + stdTurnover + excTurnover) || 1;
    const optPct = Math.round((optTurnover / totalTurnoverCases) * 100);
    const stdPct = Math.round((stdTurnover / totalTurnoverCases) * 100);
    const excPct = Math.max(0, 100 - optPct - stdPct);
    const turnoverEffPie = [
      { name: 'Optimal (<20m)', value: optPct, percentage: optPct, color: 'var(--color-green)' },
      { name: 'Standard (20-30m)', value: stdPct, percentage: stdPct, color: 'var(--color-blue)' },
      { name: 'Excessive (>30m)', value: excPct, percentage: excPct, color: 'var(--color-red)' }
    ];

    return {
      avgTurnover,
      leakageHrs,
      ovHrs,
      gaps: gapsCount,
      overtimeCases,
      turnoverCount,
      operatingDaysCount: datesSet.size,
      roomUtilization: utlizationArray,
      rootCauses,
      rootCausesPie,
      blockAllocPie,
      turnoverEffPie
    };
  }, [filteredSurgeries]);

  const executiveOverviewMetrics = React.useMemo(() => {
    let netRevenue = 0;
    let operatingMargin = 0;
    let totalDirectCost = 0;

    const specialtyAgg = {};
    const facilityAgg = {};
    const weeksAgg = [
      { name: 'Week 1', revenue: 0, cost: 0, margin: 0 },
      { name: 'Week 2', revenue: 0, cost: 0, margin: 0 },
      { name: 'Week 3', revenue: 0, cost: 0, margin: 0 },
      { name: 'Week 4', revenue: 0, cost: 0, margin: 0 }
    ];

    if (!filteredSurgeries || filteredSurgeries.length === 0) {
      return {
        netRevenue: 0,
        operatingMargin: 0,
        avgContribution: 0,
        ebitdaPct: 0,
        financialsTrend: weeksAgg,
        specialtyDist: [],
        facilityComparative: []
      };
    }

    filteredSurgeries.forEach((surg, idx) => {
      // Basic aggregations
      const rawRev = Number(surg.revenue !== undefined ? surg.revenue : (surg.expected_reimbursement || 0));
      const writeOff = Number(surg.write_off || 0);
      const rev = surg.revenue !== undefined ? surg.revenue : (surg.is_probono ? 0 : Math.max(0, rawRev - writeOff));
      const directCost = Number(surg.supplies || surg.supplies_cost || 0) + Number(surg.implants || surg.implants_cost || 0) + Number(surg.medications_cost || 0) + Number(surg.tray_cost || 0);
      const overheadCost = Number(surg.labor || surg.actual_labor_cost || 0) + Number(surg.roomCost || surg.actual_room_cost || 0);
      const cost = directCost + (includeAdvancedCosts ? overheadCost : 0);
      const marg = rev - cost;
      const isCancelled = surg.status?.toLowerCase() === 'cancelled';

      netRevenue += rev;
      operatingMargin += marg;
      totalDirectCost += cost;

      // Weekly Financials Trend (Arbitrary grouping if time span varies, or sorting chronologically)
      // We will assign cases dynamically to 4 sequential time buckets to maintain the chart shape
      const bucketIdx = Math.floor((idx / filteredSurgeries.length) * 4);
      const weekBucket = Math.min(3, bucketIdx);
      weeksAgg[weekBucket].revenue += rev;
      weeksAgg[weekBucket].cost += cost;
      weeksAgg[weekBucket].margin += marg;

      // Specialty Case Distribution
      const spec = surg.specialty || 'General Surgery';
      if (!specialtyAgg[spec]) {
        specialtyAgg[spec] = { count: 0, revenue: 0, margin: 0 };
      }
      specialtyAgg[spec].count++;
      specialtyAgg[spec].revenue += rev;
      specialtyAgg[spec].margin += marg;

      // Facility Scorecard
      const fac = surg.or || surg.or_room || 'Main ASC';
      if (!facilityAgg[fac]) {
        facilityAgg[fac] = { cases: 0, utilMinutes: 0, profitUtilMinutes: 0, revenue: 0, directCost: 0, netMargin: 0, cancellations: 0 };
      }
      facilityAgg[fac].cases++;
      facilityAgg[fac].revenue += rev;
      facilityAgg[fac].directCost += cost;
      facilityAgg[fac].netMargin += marg;
      if (isCancelled) facilityAgg[fac].cancellations++;

      const dur = parseInt(surg.duration_minutes || 60, 10);
      const actualDur = parseInt(surg.actual_duration_minutes || dur, 10);
      facilityAgg[fac].utilMinutes += actualDur;
      if (marg > 0) facilityAgg[fac].profitUtilMinutes += actualDur;
    });

    const avgContribution = Math.round(operatingMargin / filteredSurgeries.length);
    const ebitdaPct = netRevenue > 0 ? ((operatingMargin / netRevenue) * 100).toFixed(1) : 0;

    // Process Specialty Data
    const specialtyColors = ['var(--color-blue)', 'var(--color-green)', 'var(--color-purple)', 'var(--color-orange)', 'var(--color-pink)', 'var(--color-red)'];
    const specialtyDistArray = Object.entries(specialtyAgg).map(([name, data], i) => ({
      name,
      value: data.count,
      percentage: Math.round((data.count / filteredSurgeries.length) * 100),
      revenue: data.revenue,
      margin: data.margin,
      color: specialtyColors[i % specialtyColors.length]
    })).sort((a, b) => b.value - a.value);

    // Process Facility Data
    const facilityCompArray = Object.entries(facilityAgg).map(([name, data]) => {
      // Assuming 600 minutes is full capacity for a room based on the OR calculations
      const utilPct = Math.min(100, Math.round((data.utilMinutes / (data.cases > 0 ? data.cases * 60 : 600)) * 100)); // Rough heuristic for utilization per room
      const profitUtilPct = Math.min(100, Math.round((data.profitUtilMinutes / (data.cases > 0 ? data.cases * 60 : 600)) * 100));
      return {
        name,
        cases: data.cases,
        util: utilPct,
        profitUtil: profitUtilPct,
        revenue: data.revenue,
        directCost: data.directCost,
        netMargin: data.netMargin,
        cancellations: data.cancellations
      };
    });

    const topSpecialty = specialtyDistArray.length > 0 ? specialtyDistArray[0] : null;
    const topFacility = facilityCompArray.length > 0 ? facilityCompArray[0] : null;
    const costRatioPct = netRevenue > 0 ? ((totalDirectCost / netRevenue) * 100).toFixed(1) : 0;
    const profitableCases = filteredSurgeries.filter(s => {
      const rawR = Number(s.revenue !== undefined ? s.revenue : (s.expected_reimbursement || 0));
      const r = s.revenue !== undefined ? s.revenue : (s.is_probono ? 0 : Math.max(0, rawR - Number(s.write_off || 0)));
      const dc = Number(s.supplies || s.supplies_cost || 0) + Number(s.implants || s.implants_cost || 0) + Number(s.medications_cost || 0) + Number(s.tray_cost || 0);
      const oc = Number(s.labor || s.actual_labor_cost || 0) + Number(s.roomCost || s.actual_room_cost || 0);
      return (r - (dc + (includeAdvancedCosts ? oc : 0))) > 0;
    }).length;

    let totalImplants = 0, totalSupplies = 0, totalMeds = 0, totalTrays = 0, totalOverhead = 0;
    filteredSurgeries.forEach(s => {
      totalImplants += Number(s.implants || s.implants_cost || 0);
      totalSupplies += Number(s.supplies || s.supplies_cost || 0);
      totalMeds += Number(s.medications_cost || 0);
      totalTrays += Number(s.tray_cost || 0);
      if (includeAdvancedCosts) {
        totalOverhead += Number(s.labor || s.actual_labor_cost || 0) + Number(s.roomCost || s.actual_room_cost || 0);
      }
    });
    const totalCalcCost = totalImplants + totalSupplies + totalMeds + totalTrays + totalOverhead;
    const dynamicSupplyBreakdown = [
      { name: 'Implants', value: Math.round(totalImplants), percentage: totalCalcCost > 0 ? Math.round((totalImplants / totalCalcCost) * 100) : 0, color: 'var(--color-blue)' },
      { name: 'Medical Supplies', value: Math.round(totalSupplies), percentage: totalCalcCost > 0 ? Math.round((totalSupplies / totalCalcCost) * 100) : 0, color: 'var(--color-green)' },
      { name: 'Pharmaceuticals', value: Math.round(totalMeds), percentage: totalCalcCost > 0 ? Math.round((totalMeds / totalCalcCost) * 100) : 0, color: 'var(--color-purple)' },
      { name: 'Surgical Trays', value: Math.round(totalTrays), percentage: totalCalcCost > 0 ? Math.round((totalTrays / totalCalcCost) * 100) : 0, color: 'var(--color-pink)' },
      ...(includeAdvancedCosts && totalOverhead > 0 ? [{ name: 'Labor & Room Overhead', value: Math.round(totalOverhead), percentage: totalCalcCost > 0 ? Math.round((totalOverhead / totalCalcCost) * 100) : 0, color: 'var(--color-orange)' }] : [])
    ].filter(item => item.value > 0 || item.name === 'Medical Supplies');

    return {
      netRevenue,
      operatingMargin,
      totalDirectCost: totalCalcCost > 0 ? totalCalcCost : totalDirectCost,
      avgContribution,
      ebitdaPct,
      costRatioPct,
      profitableCases,
      totalCases: filteredSurgeries.length,
      topSpecialty,
      topFacility,
      dynamicSupplyBreakdown: dynamicSupplyBreakdown.length > 0 ? dynamicSupplyBreakdown : MOCK_SUPPLY_BREAKDOWN,
      financialsTrend: weeksAgg,
      specialtyDist: specialtyDistArray,
      facilityComparative: facilityCompArray
    };
  }, [filteredSurgeries, includeAdvancedCosts]);

  const [selectedCase, setSelectedCase] = useState(null);
  const [selectedSurgeon, setSelectedSurgeon] = useState(null);
  const [profileTab, setProfileTab] = useState('overview');

  // Schedule Optimizer Simulation State
  const [showAutoSuggest, setShowAutoSuggest] = useState(false);

  // Loading and Database States
  const [loading, setLoading] = useState(true);
  const [surgeonsDetails, setSurgeonsDetails] = useState(MOCK_SURGEONS_DETAILS);
  const [patients, setPatients] = useState(MOCK_PATIENTS);
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [patientSortField, setPatientSortField] = useState('');
  const [patientSortDirection, setPatientSortDirection] = useState('asc');
  const [patientPage, setPatientPage] = useState(1);
  const [patientLimit, setPatientLimit] = useState(10);
  const [patientModalOpen, setPatientModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState(null);

  // CPT Codes List State (for SurgeryScheduler)
  const [cptCodesList, setCptCodesList] = useState([]);

  // Surgeon Management State
  const [surgeonsList, setSurgeonsList] = useState([]);
  const [surgeonSearchQuery, setSurgeonSearchQuery] = useState('');
  const [surgeonSortField, setSurgeonSortField] = useState('');
  const [surgeonSortDirection, setSurgeonSortDirection] = useState('asc');
  const [surgeonPage, setSurgeonPage] = useState(1);
  const [surgeonLimit, setSurgeonLimit] = useState(10);
  const [surgeonModalOpen, setSurgeonModalOpen] = useState(false);
  const [editingSurgeon, setEditingSurgeon] = useState(null);
  const [surgeonForm, setSurgeonForm] = useState({
    firstname: '',
    lastname: '',
    specialty: '',
    license_number: '',
    phone: '',
    email: '',
    password: '',
    countryCode: '+1',
    block_templates: []
  });
  const [patientForm, setPatientForm] = useState({
    name: '',
    dob: '',
    mrn: '',
    phone: '',
    email: '',
    gender: '',
    address: '',
    insurance_provider: '',
    insurance_policy_number: '',
    insurance_group_number: '',
    insurance_type: 'Primary',
    subscriber_name: '',
    subscriber_relationship: 'Self',
    insurance_effective_date: '',
    insurance_expiration_date: '',
    copay_amount: '',
    deductible_amount: '',
    secondary_insurance_provider: '',
    secondary_insurance_policy_number: '',
    secondary_insurance_group_number: ''
  });

  const [surgeonTableData, setSurgeonTableData] = useState([
    { name: 'Dr. Malinoski Kelly', cases: 48, proced: '68 mins', turn: '18 mins', variance: '+18.4%', rev: 616416, supply: 163200, margin: 263450, avg: 5488, color: '#3b82f6' },
    { name: 'Dr. Gardner Paul', cases: 36, proced: '52 mins', turn: '14 mins', variance: '-2.1%', rev: 327780, supply: 34200, margin: 215630, avg: 5989, color: '#10b981' },
    { name: 'Dr. Walsh Mark', cases: 41, proced: '88 mins', turn: '24 mins', variance: '+31.2%', rev: 418300, supply: 122100, margin: 142910, avg: 3485, color: '#f59e0b' },
    { name: 'Dr. Bonett Andrew', cases: 28, proced: '110 mins', turn: '29 mins', variance: '+8.4%', rev: 531200, supply: 184500, margin: 157850, avg: 5637, color: '#8b5cf6' },
    { name: 'Dr. Baccaro Leopoldo', cases: 31, proced: '48 mins', turn: '16 mins', variance: '+12.6%', rev: 141020, supply: 32000, margin: 85230, avg: 2749, color: '#ec4899' }
  ]);

  const [cptTableData, setCptTableData] = useState([
    { code: '27130', desc: 'Total Knee Replacement', time: 120, turn: 25, fee: 22125, med: 18500, labor: 1800, supply: 11000, margin: 9325, pct: 42.1 },
    { code: '29827', desc: 'Knee Scope / Arthroscopy', time: 60, turn: 15, fee: 12842, med: 10200, labor: 900, supply: 5219, margin: 6723, pct: 52.3 },
    { code: '27447', desc: 'Cataract Surgery', time: 60, turn: 15, fee: 9105, med: 7800, labor: 900, supply: 3050, margin: 5155, pct: 56.6 },
    { code: '23430', desc: 'Laparoscopic Cholecystectomy', time: 90, turn: 20, fee: 8732, med: 7100, labor: 1350, supply: 3000, margin: 4382, pct: 50.1 },
    { code: '29824', desc: 'Shoulder Arthroscopy', time: 90, turn: 20, fee: 11230, med: 9100, labor: 1350, supply: 5200, margin: 4680, pct: 41.6 },
    { code: '63030', desc: 'Carpal Tunnel Release', time: 45, turn: 15, fee: 3420, med: 2900, labor: 675, supply: 850, margin: 1895, pct: 55.4 },
    { code: '49505', desc: 'Inguinal Hernia Repair', time: 90, turn: 20, fee: 10200, med: 8200, labor: 1350, supply: 3000, margin: 5850, pct: 57.3 }
  ]);

  const [_surgeonPerf, setSurgeonPerf] = useState(MOCK_SURGEON_PERF);
  const [supplyBreakdown] = useState(MOCK_SUPPLY_BREAKDOWN);

  // ASC Analyst Modal State
  const [showAscAnalyst, setShowAscAnalyst] = useState(false);

  // Dynamic real-time calculation for Surgeon Performance tab
  const dynamicSurgeonTableData = React.useMemo(() => {
    const dataList = filteredSurgeries && filteredSurgeries.length > 0 ? filteredSurgeries : surgeries;
    if (!dataList || dataList.length === 0) return surgeonTableData;

    let globalCases = 0;
    let globalSupplyCost = 0;
    dataList.forEach(s => {
      if (s.status?.toLowerCase() === 'cancelled') return;
      globalCases++;
      const directMed = Math.max(0, Number(s.supplies || s.supplies_cost || 0) + Number(s.implants || s.implants_cost || 0) + Number(s.medications_cost || 0) + Number(s.tray_cost || 0));
      globalSupplyCost += directMed;
    });
    const avgSupplyGlobal = globalCases > 0 ? globalSupplyCost / globalCases : 1;

    const surgeonMap = {};
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#6366f1'];
    let colorIdx = 0;

    dataList.forEach(s => {
      if (s.status?.toLowerCase() === 'cancelled') return;
      const doc = s.doctor || s.doctor_name || 'Unknown Surgeon';
      if (!surgeonMap[doc]) {
        const existingColor = surgeonTableData.find(st => st.name === doc)?.color;
        surgeonMap[doc] = {
          name: doc,
          cases: 0,
          totalDuration: 0,
          totalTurnover: 0,
          totalRev: 0,
          totalSupply: 0,
          totalCost: 0,
          color: existingColor || colors[colorIdx % colors.length]
        };
        colorIdx++;
      }
      const sm = surgeonMap[doc];
      sm.cases++;
      const dur = Number(s.actual_duration_minutes || s.duration_minutes || 60);
      let turnover = Number(s.turnover_time !== undefined && s.turnover_time !== null ? s.turnover_time : 20);
      if (isNaN(turnover)) turnover = 20;

      const rawRev = Number(s.revenue !== undefined ? s.revenue : (s.expected_reimbursement || 0));
      const writeOff = Number(s.write_off || 0);
      const rev = s.revenue !== undefined ? s.revenue : (s.is_probono ? 0 : Math.max(0, rawRev - writeOff));

      const directMed = Math.max(0, Number(s.supplies || s.supplies_cost || 0) + Number(s.implants || s.implants_cost || 0) + Number(s.medications_cost || 0) + Number(s.tray_cost || 0));
      const overhead = Math.max(0, Number(s.labor || s.actual_labor_cost || 0) + Number(s.roomCost || s.actual_room_cost || 0));
      const cost = directMed + (includeAdvancedCosts ? overhead : 0);

      sm.totalDuration += dur;
      sm.totalTurnover += turnover;
      sm.totalRev += rev;
      sm.totalSupply += directMed;
      sm.totalCost += cost;
    });

    const result = Object.values(surgeonMap).map(sm => {
      const avgDur = sm.cases > 0 ? Math.round(sm.totalDuration / sm.cases) : 0;
      const avgTurn = sm.cases > 0 ? Math.round(sm.totalTurnover / sm.cases) : 0;
      const avgSupply = sm.cases > 0 ? sm.totalSupply / sm.cases : 0;
      const variancePct = avgSupplyGlobal > 0 ? ((avgSupply - avgSupplyGlobal) / avgSupplyGlobal) * 100 : 0;
      const margin = sm.totalRev - sm.totalCost;
      const avgMargin = sm.cases > 0 ? Math.round(margin / sm.cases) : 0;

      return {
        name: sm.name,
        cases: sm.cases,
        proced: `${avgDur} mins`,
        turn: `${avgTurn} mins`,
        variance: (variancePct >= 0 ? '+' : '') + variancePct.toFixed(1) + '%',
        rev: Math.round(sm.totalRev),
        supply: Math.round(sm.totalSupply),
        margin: Math.round(margin),
        avg: Math.round(avgMargin),
        color: sm.color
      };
    }).sort((a, b) => b.margin - a.margin);

    return result.length > 0 ? result : surgeonTableData;
  }, [filteredSurgeries, surgeries, includeAdvancedCosts, surgeonTableData]);

  // Fetch from Supabase on component mount or authentication/facility change
  useEffect(() => {
    async function loadDatabaseData() {
      if (!authUser) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        console.log("Loading Supabase tables...");

        const [loadedSurgeons, loadedSurgeries, loadedPatients, loadedCPTList] = await Promise.all([
          db.getSurgeons(),
          db.getSurgeries(),
          db.getPatients(),
          db.getCPTCodes()
        ]);

        if (loadedSurgeons.length === 0 || loadedSurgeries.length === 0) {
          console.warn("Database loaded but returned empty or incomplete data. Using mock fallbacks.");
          setLoading(false);
          return;
        }

        // Helper to format surgeon names (must match 'Dr. Lastname Firstname' expected by detail views)
        const formatDoctorName = (s) => {
          if (!s) return 'Unknown';
          const last = s.lastname ? s.lastname.trim() : '';
          const first = s.firstname ? s.firstname.trim() : '';
          return `Dr. ${last} ${first}`.trim();
        };

        // Store CPT codes in state for SurgeryScheduler
        setCptCodesList(loadedCPTList);

        // 1. Process surgeries list
        const mappedSurgeries = loadedSurgeries.map(surg => {
          const doctorName = formatDoctorName(surg.surgeons) || surg.doctor_name || 'Unknown Surgeon';
          const rawReimb = Number(surg.expected_reimbursement || 0);
          const writeOff = Number(surg.write_off || 0);
          const revenue = surg.is_probono ? 0 : Math.max(0, rawReimb - writeOff);
          const supplies = Number(surg.supplies_cost || 0);
          const implants = Number(surg.implants_cost || 0);
          const labor = Number(surg.actual_labor_cost || 0);
          const roomCost = Number(surg.actual_room_cost || 0);
          const meds = Number(surg.medications_cost || 0);
          // Parse tray_cost from DB column or from notes fallback
          let trayCost = Number(surg.tray_cost || 0);
          if (trayCost === 0 && surg.notes) {
            const m = surg.notes.match(/\[Tray Cost:\s*([\d.]+)\]/);
            if (m) trayCost = parseFloat(m[1]);
          }
          const margin = revenue - (supplies + implants + labor + roomCost + meds + trayCost);

          let marginType = 'med';
          if (margin > 1000) marginType = 'high';
          else if (margin < 0) marginType = 'low';

          let startMin = 480;
          if (surg.start_time) {
            const [hours, minutes] = surg.start_time.split(':').map(Number);
            startMin = hours * 60 + minutes;
          }
          const duration = surg.duration_minutes || 60;
          const endMin = startMin + duration;

          const formatTime = (minutes) => {
            const h = Math.floor(minutes / 60);
            const m = minutes % 60;
            const ampm = h >= 12 ? 'PM' : 'AM';
            const displayH = h % 12 === 0 ? 12 : h % 12;
            const displayM = m < 10 ? '0' + m : m;
            return `${displayH}:${displayM} ${ampm}`;
          };

          return {
            id: surg.id,
            or: surg.or_room || 'OR 1',
            label: surg.notes || (surg.cpt_codes ? `CPT ${surg.cpt_codes}` : 'Procedure'),
            doctor: doctorName,
            start: formatTime(startMin),
            end: formatTime(endMin),
            startMin,
            endMin,
            marginType,
            code: surg.cpt_codes ? String(surg.cpt_codes).split(',')[0].trim() : 'General',
            revenue,
            supplies,
            implants,
            labor,
            roomCost,
            margin,
            date: surg.date,
            duration_minutes: duration,
            turnover_time: surg.turnover_time !== undefined && surg.turnover_time !== null ? surg.turnover_time : 20,
            // Raw DB fields forwarded so SurgeryScheduler can display them
            patient_id: surg.patient_id,
            surgeon_id: surg.surgeon_id,
            doctor_name: surg.doctor_name,
            specialty: surg.surgeons?.specialty || 'General Surgery',
            start_time: surg.start_time,
            cpt_codes: surg.cpt_codes,
            supplies_cost: supplies,
            implants_cost: implants,
            medications_cost: meds,
            tray_cost: trayCost,
            actual_start_time: surg.actual_start_time,
            actual_end_time: surg.actual_end_time,
            actual_duration_minutes: surg.actual_duration_minutes,
            actual_labor_cost: labor,
            actual_room_cost: roomCost,
            expected_reimbursement: surg.expected_reimbursement,
            write_off: surg.write_off,
            is_probono: surg.is_probono,
            or_room: surg.or_room,
            status: surg.status || 'scheduled',
            cancellation_reason: surg.cancellation_reason,
            notes: surg.notes,
            patients: surg.patients
          };
        });
        setSurgeries(mappedSurgeries);
        setPatients(loadedPatients);
        setSurgeonsList(loadedSurgeons);

        // 2. Process surgeons details
        const surgeonsDetailsObj = {};
        const surgeonColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f43f5e'];

        loadedSurgeons.forEach((s, idx) => {
          const fullName = formatDoctorName(s);
          surgeonsDetailsObj[fullName] = {
            name: fullName,
            specialty: s.specialty || 'General Surgery',
            avatar: `https://images.unsplash.com/photo-${idx % 2 === 0 ? '1622253692010-333f2da6031d' : '1594824813573-246434de83fb'}?auto=format&fit=crop&w=256&h=256&q=80`,
            color: surgeonColors[idx % surgeonColors.length],
            status: 'Active',
            npi: s.license_number || `NPI-${1000000000 + s.id}`,
            metrics: {
              cases: 0,
              avgDuration: 0,
              avgTurnover: 0,
              totalTurnover: 0,
              totalRevenue: 0,
              totalSupplies: 0,
              supplyVariance: '0.0%',
              netMargin: 0,
              avgMargin: 0,
              onTimeStart: 90 + (s.id % 8),
              utilization: 65 + (s.id % 20)
            },
            caseHistory: [
              { name: 'Jan', cases: 0, margin: 0, revenue: 0 },
              { name: 'Feb', cases: 0, margin: 0, revenue: 0 },
              { name: 'Mar', cases: 0, margin: 0, revenue: 0 },
              { name: 'Apr', cases: 0, margin: 0, revenue: 0 },
              { name: 'May', cases: 0, margin: 0, revenue: 0 }
            ],
            payerMix: [
              { name: 'Commercial', value: 20, revenue: 200000, margin: 145000, color: 'var(--color-blue)' },
              { name: 'Medicare', value: 14, revenue: 110000, margin: 65000, color: 'var(--color-green)' },
              { name: 'Self-Pay', value: 2, revenue: 17780, margin: 5630, color: 'var(--color-orange)' }
            ],
            supplyWaste: [
              { item: 'Suture Packs (Monocryl 4-0)', opened: 6, used: 5, wasteCost: 35, type: 'Suture' }
            ],
            recentCancellations: [],
            aiInsights: [
              { id: 1, type: 'med', icon: '⏳', title: 'Parallel Anesthesia Prep', desc: 'Pre-op block room blocks could reduce avg procedure duration by 6 mins, adding 4 potential slots per month.' }
            ],
            cptBreakdown: []
          };
        });

        // Group billing and mix calculations by surgeon
        mappedSurgeries.forEach(surg => {
          const doc = surg.doctor;
          if (!surgeonsDetailsObj[doc]) {
            surgeonsDetailsObj[doc] = {
              name: doc,
              specialty: 'Specialist',
              avatar: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=256&h=256&q=80',
              color: '#3b82f6',
              status: 'Active',
              npi: 'NPI-N/A',
              metrics: { cases: 0, avgDuration: 0, avgTurnover: 0, totalTurnover: 0, totalRevenue: 0, totalSupplies: 0, supplyVariance: '0.0%', netMargin: 0, avgMargin: 0, onTimeStart: 90, utilization: 75 },
              caseHistory: [
                { name: 'Jan', cases: 0, margin: 0, revenue: 0 },
                { name: 'Feb', cases: 0, margin: 0, revenue: 0 },
                { name: 'Mar', cases: 0, margin: 0, revenue: 0 },
                { name: 'Apr', cases: 0, margin: 0, revenue: 0 },
                { name: 'May', cases: 0, margin: 0, revenue: 0 }
              ],
              payerMix: [
                { name: 'Commercial', value: 1, revenue: surg.revenue * 0.6, margin: surg.margin * 0.6, color: 'var(--color-blue)' },
                { name: 'Medicare', value: 1, revenue: surg.revenue * 0.4, margin: surg.margin * 0.4, color: 'var(--color-green)' }
              ],
              supplyWaste: [],
              recentCancellations: [],
              aiInsights: [],
              cptBreakdown: []
            };
          }

          const sd = surgeonsDetailsObj[doc];
          sd.metrics.cases += 1;
          sd.metrics.avgDuration += surg.duration_minutes || 0;
          sd.metrics.netMargin += surg.margin;
          const directMed = Math.max(0, Number(surg.supplies || 0) + Number(surg.implants || 0) + Number(surg.medications_cost || 0) + Number(surg.tray_cost || 0));
          sd.metrics.totalRevenue = Math.round((sd.metrics.totalRevenue || 0) + surg.revenue);
          sd.metrics.totalSupplies = Math.round((sd.metrics.totalSupplies || 0) + directMed);
          sd.metrics.totalTurnover = (sd.metrics.totalTurnover || 0) + surg.turnover_time;

          // update case history actual
          let monthIdx = -1;
          if (surg.date) {
            const monthStr = surg.date.substring(5, 7);
            monthIdx = parseInt(monthStr, 10) - 1;
          }
          if (monthIdx >= 0 && monthIdx < 5) {
            if (sd.caseHistory[monthIdx]) {
              sd.caseHistory[monthIdx].cases += 1;
              sd.caseHistory[monthIdx].margin += surg.margin;
              sd.caseHistory[monthIdx].revenue += surg.revenue;
            }
          }

          // add to cpt breakdown
          const cleanCode = surg.code;
          let cptItem = sd.cptBreakdown.find(c => c.code === cleanCode);
          if (!cptItem) {
            cptItem = { code: cleanCode, desc: surg.label, cases: 0, avgTime: 0, margin: 0 };
            sd.cptBreakdown.push(cptItem);
          }
          cptItem.cases += 1;
          cptItem.avgTime += surg.duration_minutes;
          cptItem.margin += surg.margin;
        });

        const totalSuppliesGlobal = mappedSurgeries.reduce((sum, s) => sum + Math.max(0, Number(s.supplies || 0) + Number(s.implants || 0) + Number(s.medications_cost || 0) + Number(s.tray_cost || 0)), 0);
        const avgSupplyGlobal = mappedSurgeries.length > 0 ? totalSuppliesGlobal / mappedSurgeries.length : 1;

        // Finish average metric calculations
        Object.keys(surgeonsDetailsObj).forEach(name => {
          const sd = surgeonsDetailsObj[name];
          if (sd.metrics.cases > 0) {
            sd.metrics.avgDuration = Math.round(sd.metrics.avgDuration / sd.metrics.cases);
            sd.metrics.avgMargin = Math.round(sd.metrics.netMargin / sd.metrics.cases);
            sd.metrics.avgTurnover = Math.round(sd.metrics.totalTurnover / sd.metrics.cases);

            const surgeonAvgSupply = sd.metrics.totalSupplies / sd.metrics.cases;
            const variancePct = ((surgeonAvgSupply - avgSupplyGlobal) / avgSupplyGlobal) * 100;
            sd.metrics.supplyVariance = (variancePct >= 0 ? '+' : '') + variancePct.toFixed(1) + '%';

            sd.cptBreakdown.forEach(c => {
              c.avgTime = Math.round(c.avgTime / c.cases);
            });
          }
        });
        setSurgeonsDetails(surgeonsDetailsObj);

        // 3. Process Table list for Surgeons performance
        const surgeonTableMapped = Object.keys(surgeonsDetailsObj).map(name => {
          const sd = surgeonsDetailsObj[name];
          const rev = sd.metrics.totalRevenue || 0;
          const supplyCost = sd.metrics.totalSupplies || 0;
          return {
            name: sd.name,
            cases: sd.metrics.cases,
            proced: `${sd.metrics.avgDuration} mins`,
            turn: `${sd.metrics.avgTurnover} mins`,
            variance: sd.metrics.supplyVariance || '0.0%',
            rev,
            supply: supplyCost,
            margin: sd.metrics.netMargin,
            avg: sd.metrics.avgMargin,
            color: sd.color
          };
        }).filter(s => s.cases > 0);
        setSurgeonTableData(surgeonTableMapped.length > 0 ? surgeonTableMapped : MOCK_SURGEON_PERF);

        // 4. Update Recharts Surgeon Performance list
        const surgeonPerfMapped = surgeonTableMapped.map(s => ({
          name: s.name,
          netMargin: s.margin,
          marginCase: s.avg
        }));
        setSurgeonPerf(surgeonPerfMapped.length > 0 ? surgeonPerfMapped : MOCK_SURGEON_PERF);

        // 5. Process Case Profitability (CPT) performance
        const cptGroups = {};
        mappedSurgeries.forEach(surg => {
          const codes = surg.code.split(',');
          codes.forEach(c => {
            const cleanCode = c.trim();
            if (!cptGroups[cleanCode]) {
              cptGroups[cleanCode] = {
                code: cleanCode,
                desc: 'Procedure Code',
                cases: 0,
                time: 0,
                turn: 20,
                fee: 0,
                med: 0,
                labor: 0,
                supply: 0,
                margin: 0
              };
            }
            const cg = cptGroups[cleanCode];
            cg.cases += 1;
            cg.time += surg.duration_minutes || (surg.endMin - surg.startMin);
            cg.fee += surg.revenue;
            cg.labor += surg.labor;
            cg.supply += surg.supplies + surg.implants;
            cg.margin += surg.margin;
          });
        });

        // Resolve CPT code descriptions from database list
        const cptTableMapped = Object.keys(cptGroups).map(code => {
          const cg = cptGroups[code];
          const dbCode = loadedCPTList.find(c => c.code === code);
          const desc = dbCode ? dbCode.description : 'Surgical Procedure';
          const avgTime = Math.round(cg.time / cg.cases);
          const avgMargin = Math.round(cg.margin / cg.cases);
          const pct = cg.fee > 0 ? Math.round((cg.margin / cg.fee) * 100) : 0;
          return {
            code,
            desc,
            time: avgTime,
            turn: cg.turn,
            fee: Math.round(cg.fee / cg.cases),
            med: dbCode ? Number(dbCode.reimbursement) : Math.round(cg.fee / cg.cases),
            labor: Math.round(cg.labor / cg.cases),
            supply: Math.round(cg.supply / cg.cases),
            margin: avgMargin,
            pct
          };
        });
        setCptTableData(prev => cptTableMapped.length > 0 ? cptTableMapped : prev);

        setLoading(false);
      } catch (err) {
        console.error("Error connecting or querying Supabase database:", err);
        setLoading(false); // fallback to mock data on error
      }
    }

    loadDatabaseData();
  }, [authUser, activeFacility]);

  const handleSimulateResolve = (waitlistCase) => {
    const cancelledList = surgeries.filter(s => s.status?.toLowerCase() === 'cancelled' || s.status?.toLowerCase() === 'canceled');
    const targetCase = cancelledList.length > 0 ? cancelledList[0] : null;

    if (targetCase) {
      const updatedSurgeries = surgeries.map(s => {
        if (s.id === targetCase.id) {
          return {
            ...s,
            status: 'rescheduled',
            label: waitlistCase.desc || waitlistCase.label || 'Procedure',
            doctor: waitlistCase.surgeon || waitlistCase.doctor || s.doctor,
            revenue: Number(waitlistCase.rev || waitlistCase.revenue || 0),
            margin: Number(waitlistCase.margin || 0),
            notes: `Resolved: replaced cancelled block with ${waitlistCase.desc || waitlistCase.label}`
          };
        }
        return s;
      });
      setSurgeries(updatedSurgeries);
      setShowAutoSuggest(false);
      alert(`Success: Replaced vacant cancelled slot (${targetCase.or || 'OR'}) with ${waitlistCase.surgeon || waitlistCase.doctor}'s ${waitlistCase.desc || waitlistCase.label}. Recovered Margin Contribution: +$${Number(waitlistCase.margin || 0).toLocaleString('en-US')}.`);
    } else {
      setShowAutoSuggest(false);
      alert(`Standby Confirmed: Reserved backup slot for ${waitlistCase.surgeon || waitlistCase.doctor}'s ${waitlistCase.desc || waitlistCase.label}. Projected Margin: +$${Number(waitlistCase.margin || 0).toLocaleString('en-US')}.`);
    }
  };


  const handleExportPatients = () => {
    if (!patients || patients.length === 0) return;
    
    // Phase 25: Minimum Necessary & Export Authorization Gate (HIPAA § 164.502(b))
    const userRole = rbacService.normalizeRole(authUser?.role);
    const canExport = ['super_admin', 'org_admin', 'facility_admin', 'clinical_manager'].includes(userRole);
    if (!canExport) {
      Swal.fire({
        title: 'Access Restricted',
        text: `HIPAA Technical Access Safeguard (45 CFR § 164.312): Your user role (${userRole}) is not authorized to export unredacted patient PHI.`,
        icon: 'warning',
        background: 'var(--bg-card)',
        color: 'var(--text-primary)'
      });
      return;
    }

    try {
      db.logExportAuditEvent({
        exportType: 'CSV',
        tableName: 'patients',
        recordCount: patients.length,
        facilityId: activeFacility?.id,
        filterMetadata: {
          total_patients: patients.length,
          columns_exported: 20
        }
      });
    } catch {
      // Non-blocking telemetry
    }

    const headers = [
      'MRN', 'Patient Name', 'DOB', 'Gender', 'Phone', 'Email', 'Address',
      'Insurance Provider', 'Policy Number', 'Group Number', 'Insurance Type',
      'Subscriber Name', 'Relationship', 'Effective Date', 'Expiration Date',
      'Copay Amount', 'Deductible Amount',
      'Secondary Provider', 'Secondary Policy Number', 'Secondary Group Number'
    ];
    
    const csvContent = [
      headers.join(','),
      ...patients.map(p => {
        return [
          `"${p.mrn || ''}"`,
          `"${p.name || ''}"`,
          `"${p.dob || ''}"`,
          `"${p.gender || ''}"`,
          `"${p.phone || ''}"`,
          `"${p.email || ''}"`,
          `"${p.address || ''}"`,
          `"${p.insurance_provider || ''}"`,
          `"${p.insurance_policy_number || ''}"`,
          `"${p.insurance_group_number || ''}"`,
          `"${p.insurance_type || ''}"`,
          `"${p.subscriber_name || ''}"`,
          `"${p.subscriber_relationship || ''}"`,
          `"${p.insurance_effective_date || ''}"`,
          `"${p.insurance_expiration_date || ''}"`,
          `"${p.copay_amount || ''}"`,
          `"${p.deductible_amount || ''}"`,
          `"${p.secondary_insurance_provider || ''}"`,
          `"${p.secondary_insurance_policy_number || ''}"`,
          `"${p.secondary_insurance_group_number || ''}"`
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'patient_directory.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenAddPatient = () => {
    setEditingPatient(null);
    setPatientForm({
      name: '',
      dob: '',
      mrn: '',
      phone: '',
      email: '',
      gender: '',
      address: '',
      insurance_provider: '',
      insurance_policy_number: '',
      insurance_group_number: '',
      insurance_type: 'Primary',
      subscriber_name: '',
      subscriber_relationship: 'Self',
      insurance_effective_date: '',
      insurance_expiration_date: '',
      copay_amount: '',
      deductible_amount: '',
      secondary_insurance_provider: '',
      secondary_insurance_policy_number: '',
      secondary_insurance_group_number: ''
    });
    setPatientModalOpen(true);
  };

  const handleOpenEditPatient = (patient) => {
    setEditingPatient(patient);
    setPatientForm({
      name: patient.name ? patient.name.trim() : '',
      dob: patient.dob || '',
      mrn: patient.mrn || '',
      phone: patient.phone || '',
      email: patient.email || '',
      gender: patient.gender || '',
      address: patient.address || '',
      insurance_provider: patient.insurance_provider || '',
      insurance_policy_number: patient.insurance_policy_number || '',
      insurance_group_number: patient.insurance_group_number || '',
      insurance_type: patient.insurance_type || 'Primary',
      subscriber_name: patient.subscriber_name || '',
      subscriber_relationship: patient.subscriber_relationship || 'Self',
      insurance_effective_date: patient.insurance_effective_date || '',
      insurance_expiration_date: patient.insurance_expiration_date || '',
      copay_amount: patient.copay_amount || '',
      deductible_amount: patient.deductible_amount || '',
      secondary_insurance_provider: patient.secondary_insurance_provider || '',
      secondary_insurance_policy_number: patient.secondary_insurance_policy_number || '',
      secondary_insurance_group_number: patient.secondary_insurance_group_number || ''
    });
    setPatientModalOpen(true);
  };

  const handleSavePatient = async (e) => {
    e.preventDefault();

    // Validation
    const name = patientForm.name ? patientForm.name.trim() : '';
    if (!name) {
      alert('Full Name is required.');
      return;
    }
    if (name.length > 20) {
      alert('Full Name must be 20 characters or less.');
      return;
    }
    if (!patientForm.dob) {
      alert('Date of Birth is required.');
      return;
    }
    if (!patientForm.mrn || !patientForm.mrn.trim()) {
      alert('MRN Number is required.');
      return;
    }
    if (!patientForm.phone || patientForm.phone.replace(/\D/g, '').length !== 10) {
      alert('Phone must be exactly 10 digits.');
      return;
    }
    if (!patientForm.gender) {
      alert('Gender is required.');
      return;
    }
    if (!patientForm.email || !patientForm.email.trim()) {
      alert('Email is required.');
      return;
    }
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(patientForm.email)) {
      alert('Invalid email format.');
      return;
    }
    if (!patientForm.address || !patientForm.address.trim()) {
      alert('Address is required.');
      return;
    }
    if (!patientForm.insurance_provider || !patientForm.insurance_provider.trim()) {
      alert('Primary Insurance Provider is required.');
      return;
    }
    if (!patientForm.insurance_policy_number || !patientForm.insurance_policy_number.trim()) {
      alert('Primary Policy Number is required.');
      return;
    }
    if (!patientForm.insurance_type) {
      alert('Primary Insurance Type is required.');
      return;
    }
    if (!patientForm.subscriber_name || !patientForm.subscriber_name.trim()) {
      alert('Subscriber Name is required.');
      return;
    }
    if (!patientForm.subscriber_relationship) {
      alert('Relationship to Subscriber is required.');
      return;
    }
    if (!patientForm.insurance_effective_date) {
      alert('Effective Date is required.');
      return;
    }
    if (!patientForm.insurance_expiration_date) {
      alert('Expiration Date is required.');
      return;
    }
    if (new Date(patientForm.insurance_effective_date) >= new Date(patientForm.insurance_expiration_date)) {
      alert('Effective Date must be before Expiration Date.');
      return;
    }

    const dbPayload = {
      ...patientForm,
      ...(editingPatient ? {} : { id: Date.now() }), // explicitly pass an ID for new patients to bypass sequence collision
      name: patientForm.name ? patientForm.name.trim() : '',
      copay_amount: patientForm.copay_amount === '' || patientForm.copay_amount === null || patientForm.copay_amount === undefined ? null : parseFloat(patientForm.copay_amount),
      deductible_amount: patientForm.deductible_amount === '' || patientForm.deductible_amount === null || patientForm.deductible_amount === undefined ? null : parseFloat(patientForm.deductible_amount)
    };

    try {
      if (editingPatient) {
        // Update database
        await db.updatePatient(editingPatient.id, dbPayload);

        // Update local state
        setPatients(prev => prev.map(p => p.id === editingPatient.id ? { ...p, ...dbPayload, id: editingPatient.id } : p));
        alert('Patient updated successfully.');
      } else {
        // Insert database
        const inserted = await db.addPatient(dbPayload);

        // Update local state
        const newPatient = inserted || { ...dbPayload, id: Date.now(), created_at: new Date().toISOString() };
        setPatients(prev => [newPatient, ...prev]);
        alert('Patient added successfully.');
      }
      setPatientModalOpen(false);
    } catch (err) {
      console.error("Database patient write failed, updating locally:", err);
      const dbErrMsg = err.message || JSON.stringify(err);
      // fallback
      if (editingPatient) {
        setPatients(prev => prev.map(p => p.id === editingPatient.id ? { ...p, ...dbPayload } : p));
        alert('Patient updated locally (Database sync failed: ' + dbErrMsg + ')');
      } else {
        const localId = Date.now();
        setPatients(prev => [{ ...dbPayload, id: localId, created_at: new Date().toISOString() }, ...prev]);
        alert('Patient added locally (Database sync failed: ' + dbErrMsg + ')');
      }
      setPatientModalOpen(false);
    }
  };

  const handleDeletePatient = async (patient) => {
    if (!confirm(`Are you sure you want to permanently delete patient ${patient.name}?`)) {
      return;
    }
    try {
      await db.deletePatient(patient.id);
      setPatients(prev => prev.filter(p => p.id !== patient.id));
      alert('Patient deleted successfully.');
    } catch (err) {
      console.error("Database patient delete failed:", err);
      alert('Failed to delete patient. This usually happens if the patient has associated surgical records. Please delete their scheduled surgeries first before deleting the patient profile.');
    }
  };

  const handleExportSurgeons = () => {
    if (!surgeonsList || surgeonsList.length === 0) return;
    
    // Phase 25: Audit Surgeon Directory Export
    try {
      db.logExportAuditEvent({
        exportType: 'CSV',
        tableName: 'surgeons',
        recordCount: surgeonsList.length,
        facilityId: activeFacility?.id,
        filterMetadata: {
          total_surgeons: surgeonsList.length
        }
      });
    } catch {
      // Non-blocking telemetry
    }

    const headers = ['NPI / License', 'First Name', 'Last Name', 'Specialty', 'Email', 'Phone'];
    
    const csvContent = [
      headers.join(','),
      ...surgeonsList.map(s => {
        return [
          `"${s.license_number || ''}"`,
          `"${s.firstname || ''}"`,
          `"${s.lastname || ''}"`,
          `"${s.specialty || ''}"`,
          `"${s.email || ''}"`,
          `"${s.phone || ''}"`
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'surgeons_directory.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenAddSurgeon = () => {
    setEditingSurgeon(null);
    setSurgeonForm({
      firstname: '',
      lastname: '',
      specialty: '',
      license_number: '',
      phone: '',
      email: '',
      password: '',
      countryCode: '+1',
      block_templates: []
    });
    setSurgeonModalOpen(true);
  };

  const handleOpenEditSurgeon = (s) => {
    setEditingSurgeon(s);

    // Parse phone number
    let phoneStr = s.phone || '';
    let country = '+1';
    if (phoneStr.startsWith('+')) {
      const parts = phoneStr.split(' ');
      if (parts.length > 1) {
        country = parts[0];
        phoneStr = parts.slice(1).join('');
      } else {
        const digits = phoneStr.replace(/\D/g, '');
        if (digits.length > 10) {
          phoneStr = digits.slice(-10);
        } else {
          phoneStr = digits;
        }
      }
    }
    phoneStr = phoneStr.replace(/\D/g, '').slice(0, 10);

    setSurgeonForm({
      firstname: s.firstname || '',
      lastname: s.lastname || '',
      specialty: s.specialty || '',
      license_number: s.license_number || '',
      phone: phoneStr,
      email: s.email || '',
      password: s.password || 'surgeon123',
      countryCode: country,
      block_templates: s.block_templates || []
    });
    setSurgeonModalOpen(true);
  };

  const handleSaveSurgeon = async (e) => {
    e.preventDefault();

    // Validation
    const first = surgeonForm.firstname ? surgeonForm.firstname.trim() : '';
    const last = surgeonForm.lastname ? surgeonForm.lastname.trim() : '';
    const spec = surgeonForm.specialty ? surgeonForm.specialty.trim() : '';
    const lic = surgeonForm.license_number ? surgeonForm.license_number.trim() : '';
    const phone = surgeonForm.phone ? surgeonForm.phone.replace(/\D/g, '') : '';
    const email = surgeonForm.email ? surgeonForm.email.trim() : '';
    const password = surgeonForm.password ? surgeonForm.password.trim() : '';

    if (!first) { alert('First Name is required.'); return; }
    if (first.length > 20) { alert('First Name must be 20 characters or less.'); return; }
    if (!last) { alert('Last Name is required.'); return; }
    if (last.length > 20) { alert('Last Name must be 20 characters or less.'); return; }
    if (!spec) { alert('Specialty is required.'); return; }
    if (!lic) { alert('License / NPI is required.'); return; }
    if (phone.length !== 10) { alert('Phone must be exactly 10 digits.'); return; }
    if (!email) { alert('Email is required.'); return; }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) { alert('Invalid email format.'); return; }
    if (!password) { alert('Password is required.'); return; }

    const fullPhone = `${surgeonForm.countryCode} ${phone}`;

    const dbPayload = {
      firstname: first,
      lastname: last,
      specialty: spec,
      license_number: lic,
      phone: fullPhone,
      email: email,
      block_templates: surgeonForm.block_templates || []
    };

    try {
      if (editingSurgeon) {
        // Update DB
        const updated = await db.updateSurgeon(editingSurgeon.id, dbPayload);

        // Update local state list
        const updatedSurgeon = updated || { ...dbPayload, id: editingSurgeon.id };
        setSurgeonsList(prev => prev.map(s => s.id === editingSurgeon.id ? updatedSurgeon : s));
        alert('Surgeon updated successfully.');
      } else {
        // Insert DB
        const inserted = await db.addSurgeon(dbPayload);

        // Update local state list
        const newSurgeon = inserted || { ...dbPayload, id: Date.now(), created_at: new Date().toISOString() };
        setSurgeonsList(prev => [newSurgeon, ...prev]);
        alert('Surgeon added successfully.');
      }
      setSurgeonModalOpen(false);
    } catch (err) {
      console.error("Database surgeon write failed, updating locally:", err);
      if (editingSurgeon) {
        setSurgeonsList(prev => prev.map(s => s.id === editingSurgeon.id ? { ...s, ...dbPayload } : s));
        alert('Surgeon updated locally (Database sync failed).');
      } else {
        const localId = Date.now();
        setSurgeonsList(prev => [{ ...dbPayload, id: localId, created_at: new Date().toISOString() }, ...prev]);
        alert('Surgeon added locally (Database sync failed).');
      }
      setSurgeonModalOpen(false);
    }
  };

  const handleDeleteSurgeon = async (s) => {
    const displayName = `${s.firstname || ''} ${s.lastname || ''}`.trim() || s.name;
    if (!confirm(`Are you sure you want to permanently delete surgeon ${displayName}?`)) {
      return;
    }
    try {
      await db.deleteSurgeon(s.id);
      setSurgeonsList(prev => prev.filter(item => item.id !== s.id));
      alert('Surgeon deleted successfully.');
    } catch (err) {
      console.error("Database surgeon delete failed, deleting locally:", err);
      setSurgeonsList(prev => prev.filter(item => item.id !== s.id));
      alert('Surgeon deleted locally (Database sync failed).');
    }
  };

  const handleAddCPT = async (cptData) => {
    try {
      const inserted = await db.addCPTCode(cptData);
      const newCpt = inserted || { ...cptData, id: Date.now(), created_at: new Date().toISOString() };
      setCptCodesList(prev => [newCpt, ...prev]);

      const newTableItem = {
        code: newCpt.code,
        desc: newCpt.description,
        time: newCpt.average_duration || 60,
        turn: newCpt.turnover_time || 20,
        fee: newCpt.reimbursement || 0,
        med: newCpt.reimbursement || 0,
        labor: 0,
        supply: newCpt.cost || 0,
        margin: (newCpt.reimbursement || 0) - (newCpt.cost || 0),
        pct: newCpt.reimbursement > 0 ? Math.round(((newCpt.reimbursement - (newCpt.cost || 0)) / newCpt.reimbursement) * 100) : 0
      };
      setCptTableData(prev => [newTableItem, ...prev]);
      alert('CPT code registered successfully.');
    } catch (err) {
      console.error('Error adding CPT code:', err);
      if (err && (err.code === '23505' || String(err.message || '').includes('already exists'))) {
        alert('Failed to register: CPT code already exists in the database.');
      } else {
        alert('Failed to register CPT code.');
      }
      throw err;
    }
  };

  const handleUpdateCPT = async (id, updates) => {
    try {
      await db.updateCPTCode(id, updates);
      setCptCodesList(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));

      setCptTableData(prev => prev.map(c => c.code === updates.code ? {
        ...c,
        desc: updates.description,
        time: updates.average_duration || c.time,
        turn: updates.turnover_time || c.turn,
        fee: updates.reimbursement !== null && updates.reimbursement !== undefined ? updates.reimbursement : c.fee,
        med: updates.reimbursement !== null && updates.reimbursement !== undefined ? updates.reimbursement : c.med,
        supply: updates.cost !== null && updates.cost !== undefined ? updates.cost : c.supply,
        margin: (updates.reimbursement !== null && updates.reimbursement !== undefined ? updates.reimbursement : c.fee) - (updates.cost !== null && updates.cost !== undefined ? updates.cost : c.supply),
        pct: (updates.reimbursement || c.fee) > 0 ? Math.round((((updates.reimbursement !== null && updates.reimbursement !== undefined ? updates.reimbursement : c.fee) - (updates.cost !== null && updates.cost !== undefined ? updates.cost : c.supply)) / (updates.reimbursement || c.fee)) * 100) : 0
      } : c));
      alert('CPT code updated successfully.');
    } catch (err) {
      console.error('Error updating CPT code:', err);
      if (err && (err.code === '23505' || String(err.message || '').includes('already exists'))) {
        alert('Failed to update: CPT code already exists in the database.');
      } else {
        alert('Failed to update CPT code.');
      }
      throw err;
    }
  };

  const handleDeleteCPT = async (id) => {
    try {
      const cptToDelete = cptCodesList.find(c => c.id === id);
      await db.deleteCPTCode(id);
      setCptCodesList(prev => prev.filter(c => c.id !== id));
      if (cptToDelete) {
        setCptTableData(prev => prev.filter(c => c.code !== cptToDelete.code));
      }
      alert('CPT code deleted successfully.');
    } catch (err) {
      console.error('Error deleting CPT code:', err);
      alert('Failed to delete CPT code.');
    }
  };

  const filteredPatients = patients.filter(p => {
    const q = patientSearchQuery.toLowerCase();
    return (
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.mrn && p.mrn.toLowerCase().includes(q)) ||
      (p.insurance_provider && p.insurance_provider.toLowerCase().includes(q))
    );
  }).sort((a, b) => {
    if (!patientSortField) return 0;

    let valA = a[patientSortField] || '';
    let valB = b[patientSortField] || '';

    if (patientSortField === 'mrn') {
      valA = parseInt(String(valA).replace(/\D/g, '')) || 0;
      valB = parseInt(String(valB).replace(/\D/g, '')) || 0;
    } else {
      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();
    }

    if (valA < valB) return patientSortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return patientSortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(filteredPatients.length / patientLimit) || 1;
  const startIndex = (patientPage - 1) * patientLimit;
  const endIndex = startIndex + patientLimit;
  const paginatedPatients = filteredPatients.slice(startIndex, endIndex);

  const handlePatientSort = (field) => {
    if (patientSortField === field) {
      setPatientSortDirection(patientSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setPatientSortField(field);
      setPatientSortDirection('asc');
    }
  };

  const renderPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, patientPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    if (start > 1) {
      pages.push(
        <button key={1} className={`btn-header ${patientPage === 1 ? 'btn-primary' : ''}`} style={{ height: '32px', width: '32px', padding: 0, minWidth: 'auto', justifyContent: 'center' }} onClick={() => setPatientPage(1)}>1</button>
      );
      if (start > 2) {
        pages.push(<span key="ellipsis-start" style={{ padding: '0 4px', alignSelf: 'center' }}>...</span>);
      }
    }

    for (let i = start; i <= end; i++) {
      pages.push(
        <button
          key={i}
          className={`btn-header ${patientPage === i ? 'btn-primary' : ''}`}
          style={{ height: '32px', width: '32px', padding: 0, minWidth: 'auto', justifyContent: 'center' }}
          onClick={() => setPatientPage(i)}
        >
          {i}
        </button>
      );
    }

    if (end < totalPages) {
      if (end < totalPages - 1) {
        pages.push(<span key="ellipsis-end" style={{ padding: '0 4px', alignSelf: 'center' }}>...</span>);
      }
      pages.push(
        <button key={totalPages} className={`btn-header ${patientPage === totalPages ? 'btn-primary' : ''}`} style={{ height: '32px', width: '32px', padding: 0, minWidth: 'auto', justifyContent: 'center' }} onClick={() => setPatientPage(totalPages)}>{totalPages}</button>
      );
    }

    return pages;
  };

  // Surgeon pagination & filtering
  const filteredSurgeons = surgeonsList.filter(s => {
    const q = surgeonSearchQuery.toLowerCase();
    const fullName = `${s.firstname || ''} ${s.lastname || ''}`.toLowerCase();
    return (
      (fullName.includes(q)) ||
      (s.specialty && s.specialty.toLowerCase().includes(q)) ||
      (s.license_number && s.license_number.toLowerCase().includes(q)) ||
      (s.email && s.email.toLowerCase().includes(q)) ||
      (s.phone && s.phone.toLowerCase().includes(q))
    );
  }).sort((a, b) => {
    if (!surgeonSortField) return 0;

    let valA = '';
    let valB = '';

    if (surgeonSortField === 'license') {
      valA = a.license_number || '';
      valB = b.license_number || '';
    } else if (surgeonSortField === 'name') {
      valA = `${a.lastname || ''} ${a.firstname || ''}`;
      valB = `${b.lastname || ''} ${b.firstname || ''}`;
    }

    valA = String(valA).toLowerCase();
    valB = String(valB).toLowerCase();

    if (valA < valB) return surgeonSortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return surgeonSortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const surgeonTotalPages = Math.ceil(filteredSurgeons.length / surgeonLimit) || 1;
  const surgeonStartIndex = (surgeonPage - 1) * surgeonLimit;
  const surgeonEndIndex = surgeonStartIndex + surgeonLimit;
  const paginatedSurgeons = filteredSurgeons.slice(surgeonStartIndex, surgeonEndIndex);

  const handleSurgeonSort = (field) => {
    if (surgeonSortField === field) {
      setSurgeonSortDirection(surgeonSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSurgeonSortField(field);
      setSurgeonSortDirection('asc');
    }
  };

  const renderSurgeonPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, surgeonPage - Math.floor(maxVisible / 2));
    let end = Math.min(surgeonTotalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    if (start > 1) {
      pages.push(
        <button key={1} className={`btn-header ${surgeonPage === 1 ? 'btn-primary' : ''}`} style={{ height: '32px', width: '32px', padding: 0, minWidth: 'auto', justifyContent: 'center' }} onClick={() => setSurgeonPage(1)}>1</button>
      );
      if (start > 2) {
        pages.push(<span key="ellipsis-start" style={{ padding: '0 4px', alignSelf: 'center' }}>...</span>);
      }
    }

    for (let i = start; i <= end; i++) {
      pages.push(
        <button
          key={i}
          className={`btn-header ${surgeonPage === i ? 'btn-primary' : ''}`}
          style={{ height: '32px', width: '32px', padding: 0, minWidth: 'auto', justifyContent: 'center' }}
          onClick={() => setSurgeonPage(i)}
        >
          {i}
        </button>
      );
    }

    if (end < surgeonTotalPages) {
      if (end < surgeonTotalPages - 1) {
        pages.push(<span key="ellipsis-end" style={{ padding: '0 4px', alignSelf: 'center' }}>...</span>);
      }
      pages.push(
        <button key={surgeonTotalPages} className={`btn-header ${surgeonPage === surgeonTotalPages ? 'btn-primary' : ''}`} style={{ height: '32px', width: '32px', padding: 0, minWidth: 'auto', justifyContent: 'center' }} onClick={() => setSurgeonPage(surgeonTotalPages)}>{surgeonTotalPages}</button>
      );
    }
    return pages;
  };

  // 1. Unauthenticated view -> Login Page
  if (!authUser) {
    return (
      <LoginPage
        onLogin={(user) => setAuthUser(user)}
        theme={theme}
        setTheme={setTheme}
      />
    );
  }

  // 2. Surgeon portal view -> Dedicated Surgeon Workspace
  if (authUser.role === 'surgeon') {
    return (
      <SurgeonPortal
        surgeon={authUser.surgeonData || authUser}
        onLogout={handleLogout}
        theme={theme}
        setTheme={setTheme}
      />
    );
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: 'var(--bg-main)',
        color: 'var(--text-primary)',
        fontFamily: 'Outfit, sans-serif'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          borderRadius: '50%',
          border: '3px solid rgba(59, 130, 246, 0.1)',
          borderTopColor: '#3b82f6',
          animation: 'spin 1s linear infinite',
          marginBottom: '20px'
        }}></div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', letterSpacing: '0.5px' }}>Loading Command Center...</h2>
        <p style={{ fontSize: '0.85rem', color: '#5e6c84', marginTop: '8px' }}>Connecting to Supabase Database</p>
        <style dangerouslySetInnerHTML={{
          __html: `
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}} />
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* ==========================================
          SIDEBAR
          ========================================== */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">➕</div>
          <div className="logo-text">
            <span className="logo-title">ASC Profitability</span>
            <span className="logo-subtitle">Platform</span>
          </div>
        </div>

        <nav className="sidebar-menu">
          <div className="sidebar-section-header" style={{ paddingTop: '4px' }}>
            🏠 Dashboard
          </div>
          <div
            className={`menu-item ${activeTab === 'dashboard' && !selectedSurgeon ? 'active' : ''}`}
            onClick={() => { setActiveTab('dashboard'); setSelectedSurgeon(null); }}
          >
            <div className="menu-item-icon"><LayoutDashboard size={16} /></div>
            Executive Dashboard
          </div>
          <div
            className={`menu-item ${activeTab === 'overview' && !selectedSurgeon ? 'active' : ''}`}
            onClick={() => { setActiveTab('overview'); setSelectedSurgeon(null); }}
          >
            <div className="menu-item-icon"><TrendingUp size={16} /></div>
            Executive Summary
          </div>

          <div className="sidebar-section-divider"></div>

          <div className="sidebar-section-header">
            📅 Scheduling
          </div>
          <div
            className={`menu-item ${activeTab === 'scheduler' && !selectedSurgeon ? 'active' : ''}`}
            onClick={() => { setActiveTab('scheduler'); setSelectedSurgeon(null); }}
          >
            <div className="menu-item-icon"><CalendarDays size={16} /></div>
            Surgical Case Log
          </div>
          <div
            className={`menu-item ${activeTab === 'caselog_scheduling' && !selectedSurgeon ? 'active' : ''}`}
            onClick={() => { setActiveTab('caselog_scheduling'); setSelectedSurgeon(null); }}
          >
            <div className="menu-item-icon"><CalendarDays size={16} /></div>
            Case logs Scheduling
          </div>
          <div
            className={`menu-item ${activeTab === 'or_block_schedule' && !selectedSurgeon ? 'active' : ''}`}
            onClick={() => { setActiveTab('or_block_schedule'); setSelectedSurgeon(null); }}
          >
            <div className="menu-item-icon"><CalendarDays size={16} /></div>
            Operation Room Scheduling
          </div>
          <div
            className={`menu-item ${activeTab === 'cancellations' && !selectedSurgeon ? 'active' : ''}`}
            onClick={() => { setActiveTab('cancellations'); setSelectedSurgeon(null); }}
          >
            <div className="menu-item-icon"><XCircle size={16} /></div>
            Case Cancellations
          </div>

          <div className="sidebar-section-divider"></div>

          <div className="sidebar-section-header">
            👥 Patients
          </div>
          <div
            className={`menu-item ${activeTab === 'patients' && !selectedSurgeon ? 'active' : ''}`}
            onClick={() => { setActiveTab('patients'); setSelectedSurgeon(null); }}
          >
            <div className="menu-item-icon"><Users size={16} /></div>
            Patient Registry
          </div>

          <div className="sidebar-section-divider"></div>

          <div className="sidebar-section-header">
            🏢 Operating Rooms
          </div>
          <div
            className={`menu-item ${activeTab === 'or' && !selectedSurgeon ? 'active' : ''}`}
            onClick={() => { setActiveTab('or'); setSelectedSurgeon(null); }}
          >
            <div className="menu-item-icon"><Clock size={16} /></div>
            Operating Room Performance
          </div>
          <div
            className={`menu-item ${activeTab === 'ot_cost_manage' && !selectedSurgeon ? 'active' : ''}`}
            onClick={() => { setActiveTab('ot_cost_manage'); setSelectedSurgeon(null); }}
          >
            <div className="menu-item-icon"><DollarSign size={16} /></div>
            Operating Room Costs
          </div>

          <div className="sidebar-section-divider"></div>

          <div className="sidebar-section-header">
            👨‍⚕️ Providers
          </div>
          <div
            className={`menu-item ${activeTab === 'surgeons_manage' && !selectedSurgeon ? 'active' : ''}`}
            onClick={() => { setActiveTab('surgeons_manage'); setSelectedSurgeon(null); }}
          >
            <div className="menu-item-icon"><UserCheck size={16} /></div>
            Surgeon Management
          </div>
          <div
            className={`menu-item ${(activeTab === 'surgeons' || selectedSurgeon) ? 'active' : ''}`}
            onClick={() => { setActiveTab('surgeons'); setSelectedSurgeon(null); }}
          >
            <div className="menu-item-icon"><UserCheck size={16} /></div>
            Surgeon Performance
          </div>
          <div
            className={`menu-item ${activeTab === 'staff_manage' && !selectedSurgeon ? 'active' : ''}`}
            onClick={() => { setActiveTab('staff_manage'); setSelectedSurgeon(null); }}
          >
            <div className="menu-item-icon"><Users size={16} /></div>
            Nurses & Staff Management
          </div>

          <div className="sidebar-section-divider"></div>

          <div className="sidebar-section-header">
            🏥 Clinical
          </div>
          <div
            className={`menu-item ${activeTab === 'cpt_manage' && !selectedSurgeon ? 'active' : ''}`}
            onClick={() => { setActiveTab('cpt_manage'); setSelectedSurgeon(null); }}
          >
            <div className="menu-item-icon"><Sliders size={16} /></div>
            CPT Codes Management
          </div>
          <div
            className={`menu-item ${activeTab === 'upload_code_files' && !selectedSurgeon ? 'active' : ''}`}
            onClick={() => { setActiveTab('upload_code_files'); setSelectedSurgeon(null); }}
          >
            <div className="menu-item-icon"><Upload size={16} /></div>
            Upload new Code Files
          </div>

          <div className="sidebar-section-divider"></div>

          <div className="sidebar-section-header">
            📊 Analytics
          </div>
          <div
            className={`menu-item ${activeTab === 'business_analysis' && !selectedSurgeon ? 'active' : ''}`}
            onClick={() => { setActiveTab('business_analysis'); setSelectedSurgeon(null); }}
          >
            <div className="menu-item-icon"><Activity size={16} /></div>
            Full Business Analysis
          </div>

          <div className="sidebar-section-divider"></div>

          <div className="sidebar-section-header">
            🤖 AI Center
          </div>
          <div
            className={`menu-item ${activeTab === 'ai_ops_analyst' && !selectedSurgeon ? 'active' : ''}`}
            onClick={() => { setActiveTab('ai_ops_analyst'); setSelectedSurgeon(null); }}
          >
            <div className="menu-item-icon"><Sparkles size={16} /></div>
            AI Insights
          </div>
          <div
            className={`menu-item ${activeTab === 'instruction' && !selectedSurgeon ? 'active' : ''}`}
            onClick={() => { setActiveTab('instruction'); setSelectedSurgeon(null); }}
          >
            <div className="menu-item-icon"><Bot size={16} /></div>
            Instruction Panel
          </div>
          <div
            className={`menu-item ${activeTab === 'ai_agent' && !selectedSurgeon ? 'active' : ''}`}
            onClick={() => { setActiveTab('ai_agent'); setSelectedSurgeon(null); }}
          >
            <div className="menu-item-icon"><Brain size={16} /></div>
            AI Agent
          </div>

          <div className="sidebar-section-divider"></div>

          <div className="sidebar-section-header">
            ⚙️ Administration
          </div>
          <div
            className={`menu-item ${activeTab === 'user_management' && !selectedSurgeon ? 'active' : ''}`}
            onClick={() => { setActiveTab('user_management'); setSelectedSurgeon(null); }}
          >
            <div className="menu-item-icon"><Users size={16} /></div>
            User Accounts
          </div>
          <div
            className={`menu-item ${activeTab === 'role_management' && !selectedSurgeon ? 'active' : ''}`}
            onClick={() => { setActiveTab('role_management'); setSelectedSurgeon(null); }}
          >
            <div className="menu-item-icon"><Shield size={16} /></div>
            Roles & Permissions
          </div>
          <div
            className={`menu-item ${activeTab === 'audit_logs' && !selectedSurgeon ? 'active' : ''}`}
            onClick={() => { setActiveTab('audit_logs'); setSelectedSurgeon(null); }}
          >
            <div className="menu-item-icon"><Activity size={16} /></div>
            Audit Logs
          </div>
          <div
            className={`menu-item ${activeTab === 'settings' && !selectedSurgeon ? 'active' : ''}`}
            onClick={() => { setActiveTab('settings'); setSelectedSurgeon(null); }}
          >
            <div className="menu-item-icon"><Settings size={16} /></div>
            System Settings
          </div>

          <div className="sidebar-section-divider" style={{ marginTop: '16px', marginBottom: '8px' }}></div>

          {/* Theme Switcher inside Sidebar */}
          <div
            onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
            style={{
              margin: '6px 16px 16px 16px',
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: '600',
              transition: 'all 0.2s ease'
            }}
            title="Switch Design Scheme"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {theme === 'dark' ? <Moon size={16} style={{ color: '#60a5fa' }} /> : <Sun size={16} style={{ color: '#fbbf24' }} />}
              {theme === 'dark' ? 'Dark Theme' : 'Light Theme'}
            </span>
            <span style={{ fontSize: '0.75rem', padding: '2px 8px', backgroundColor: theme === 'dark' ? '#1e3a8a' : '#2563eb', borderRadius: '12px', color: '#fff' }}>
              Switch
            </span>
          </div>
        </nav>

        <div className="sidebar-profile" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
          <div
            onClick={() => { setActiveTab('profile'); setSelectedSurgeon(null); }}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden', cursor: 'pointer', flex: 1 }}
            title="View Profile & Credentials"
          >
            <div className="profile-avatar">{getInitials(authUser?.name || 'Admin')}</div>
            <div className="profile-info" style={{ overflow: 'hidden' }}>
              <span className="profile-name" style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {authUser?.name || 'Admin Director'}
              </span>
              <span className="profile-role">
                {CANONICAL_ROLES.find(r => r.slug === rbacService.normalizeRole(authUser?.role))?.name || (authUser?.role ? String(authUser.role).toUpperCase() : 'Authorized Staff')}
              </span>
            </div>
          </div>
          <button
            onClick={() => handleLogout()}
            title="Log Out of Session"
            style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#f87171',
              cursor: 'pointer',
              padding: '6px 10px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.72rem',
              fontWeight: '600',
              flexShrink: 0,
              transition: 'all 0.2s ease'
            }}
          >
            <LogOut size={13} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* ==========================================
          MAIN WORKSPACE
          ========================================== */}
      <main className="main-content">
        <header className="main-header">
          <div className="header-title-area">
            <h1 className="header-title">
              {selectedSurgeon ? `Surgeon Profile: ${selectedSurgeon}` : (
                <>
                  {activeTab === 'dashboard' && 'ASC Command Center'}
                  {activeTab === 'overview' && 'Executive Overview'}
                  {activeTab === 'business_analysis' && 'Full Business Analysis'}
                  {activeTab === 'or' && 'OR Performance'}
                  {activeTab === 'surgeons' && 'Surgeon Performance'}
                  {activeTab === 'surgeon_management' && 'Surgeon Management'}
                  {activeTab === 'surgeons_manage' && 'Surgeon Management'}
                  {activeTab === 'patients' && 'Patient Management'}
                  {activeTab === 'financial' && 'Financial Performance'}
                  {activeTab === 'cpt' && 'Case Profitability'}
                  {activeTab === 'cpt_manage' && 'CPT Codes Management'}
                  {activeTab === 'upload_code_files' && 'Upload new Code Files'}
                  {activeTab === 'payer' && 'Payer Intelligence'}
                  {activeTab === 'supply' && 'Supply Chain'}
                  {activeTab === 'cancellations' && 'Cancellations'}
                  {activeTab === 'reports' && 'Reports & Analytics'}
                  {activeTab === 'ai_ops_analyst' && 'AI Insights'}
                  {activeTab === 'data' && 'Data Explorer'}
                  {activeTab === 'settings' && 'System Configuration Settings'}
                  {activeTab === 'help' && 'Help & Support'}
                  {activeTab === 'scheduler' && 'Surgery Log & OR Schedule'}
                  {activeTab === 'caselog_scheduling' && 'Case Log Scheduling Optimization'}
                  {activeTab === 'instruction' && 'Chatbot Instructions'}
                  {activeTab === 'ai_agent' && 'AI Agent Workbench'}
                  {activeTab === 'profile' && 'User Profile & Security Credentials'}
                  {activeTab === 'user_management' && 'User Accounts & Facility Memberships'}
                  {activeTab === 'role_management' && 'Roles & Permissions Architecture'}
                  {activeTab === 'audit_logs' && 'Compliance Audit Trail & Provenance'}
                </>
              )}
            </h1>
            <span className="header-subtitle">
              {selectedSurgeon ? '360° clinical operational, preference cards, payer mix, and margin analysis dashboard' : (
                <>
                  {activeTab === 'dashboard' && 'Real-time operational and financial intelligence for ambulatory surgery centers'}
                  {activeTab === 'overview' && 'Strategic summaries of health system indicators'}
                  {activeTab === 'business_analysis' && 'System strengths, bottlenecks, and actionable improvements per OR'}
                  {activeTab === 'or' && 'Deep-dive into room allocation, turnover times, and block wastage'}
                  {activeTab === 'surgeons' && 'Caseloads, turnover performance, and financial contribution by surgeon'}
                  {activeTab === 'surgeon_management' && 'Search, filter, and manage surgeon profiles and credentials'}
                  {activeTab === 'surgeons_manage' && 'Search, filter, and manage surgeon profiles and credentials'}
                  {activeTab === 'patients' && 'Search, filter, and view patient demographics, health insurances, and medical records'}
                  {activeTab === 'financial' && 'Analysis of revenues, expenses, EBITDA margins, and bottom lines'}
                  {activeTab === 'cpt' && 'Contribution margins, procedure times, and volumes by CPT code'}
                  {activeTab === 'payer' && 'Payer mix contribution margins and reimbursement analytics'}
                  {activeTab === 'supply' && 'Supply variance tracking and preference card standardization tools'}
                  {activeTab === 'cancellations' && 'Cancellations tracking, revenue leak analysis, and predictive risk analysis'}
                  {activeTab === 'reports' && 'Standard financial and operational reports export'}
                  {activeTab === 'ai_ops_analyst' && 'Modular operational optimization engine'}
                  {activeTab === 'data' && 'Ad-hoc data querying and reports builder'}
                  {activeTab === 'settings' && 'Manage operational baseline costs, roles, and integrations'}
                  {activeTab === 'help' && 'Support desk and user guides'}
                  {activeTab === 'scheduler' && 'Schedule, track, and analyze surgical cases with full cost and OR time data'}
                  {activeTab === 'caselog_scheduling' && 'AI-powered optimization of historical case logs to generate ideal OR schedules'}
                  {activeTab === 'instruction' && 'Manage dynamic questions and categories for the AI Chatbot'}
                  {activeTab === 'ai_agent' && 'Interact with the AI Agent for intelligent workflow automation'}
                  {activeTab === 'profile' && 'Manage your account details and update your login password'}
                  {activeTab === 'user_management' && 'User provisioning, active facility memberships, and department assignments'}
                  {activeTab === 'role_management' && 'Role hierarchy, built-in system immutability, and 13-domain permission matrix'}
                  {activeTab === 'audit_logs' && 'HIPAA § 164.312(b) immutable transaction audit ledger, state diffs, and AI telemetry'}
                </>
              )}
            </span>
          </div>

          <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Multi-Facility Switcher Dropdown */}
            <div className="header-facility-container" ref={facilityMenuRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setFacilityDropdownOpen(prev => !prev)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: theme === 'dark' ? '#1E3A5F' : 'var(--bg-toggle, #f1f5f9)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  padding: '7px 15px',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                  outline: 'none',
                  flexShrink: 0
                }}
                title="Switch Surgical Facility"
              >
                <Building2 size={15} style={{ color: 'var(--color-blue, #3b82f6)' }} />
                <span>{activeFacility?.name || 'Naples Surgery Center'}</span>
                <ChevronDown size={14} style={{ opacity: 0.7 }} />
              </button>

              {facilityDropdownOpen && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: '280px',
                  backgroundColor: 'var(--bg-card, #1e293b)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                  zIndex: 1000,
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-light)', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    {activeFacility?.organization_name || 'Select Facility'}
                  </div>
                  {facilities.map(fac => {
                    const isSelected = fac.id === activeFacility?.id;
                    return (
                      <button
                        key={fac.id}
                        onClick={() => {
                          setActiveFacility(fac);
                          db.setActiveFacility(fac);
                          setFacilityDropdownOpen(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: 'none',
                          background: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                          color: isSelected ? 'var(--color-blue, #3b82f6)' : 'var(--text-primary)',
                          fontWeight: isSelected ? '700' : '500',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontSize: '0.85rem',
                          transition: 'background 0.15s'
                        }}
                      >
                        <div>
                          <div>{fac.name}</div>
                          {fac.address && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{fac.address}</div>}
                        </div>
                        {isSelected && <CheckCircle2 size={16} style={{ color: 'var(--color-blue, #3b82f6)' }} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>


            {!['settings', 'profile', 'business_analysis', 'instruction', 'ai_agent', 'ai_ops_analyst', 'or_block_schedule', 'cancellations', 'ot_cost_manage', 'cpt_manage', 'surgeons_manage', 'staff_manage', 'patients', 'scheduler', 'user_management', 'role_management', 'audit_logs'].includes(activeTab) && (
              <>

                {/* Toggle Group */}
                <div style={{
                  display: 'flex',
                  backgroundColor: 'var(--bg-toggle, #f1f5f9)',
                  borderRadius: '8px',
                  padding: '4px',
                  alignItems: 'center',
                  border: '1px solid var(--border-light)'
                }}>
                  {['Day', 'Week', 'Month', 'Year', 'All'].map(filter => (
                    <button
                      key={filter}
                      onClick={() => setTimeFilter(filter)}
                      style={{
                        border: 'none',
                        background: timeFilter === filter ? 'var(--bg-toggle-btn, #fff)' : 'transparent',
                        color: timeFilter === filter ? (theme === 'dark' ? '#ffffff' : 'var(--color-blue, #3b82f6)') : 'var(--text-muted, #64748b)',
                        padding: '6px 14px',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        fontWeight: timeFilter === filter ? '700' : '500',
                        cursor: 'pointer',
                        boxShadow: timeFilter === filter ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                        transition: 'all 0.2s',
                        outline: 'none'
                      }}
                    >
                      {filter}
                    </button>
                  ))}
                </div>

                {/* Date Selector */}
                {timeFilter !== 'All' && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: 'var(--bg-toggle, #f1f5f9)',
                    borderRadius: '8px',
                    padding: '6px 14px',
                    gap: '8px',
                    color: 'var(--text-primary, #334155)',
                    fontSize: '0.85rem',
                    fontWeight: '600',
                    border: '1px solid var(--border-color, #e2e8f0)',
                    cursor: 'pointer'
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', marginRight: '10px' }}>📅</span>
                    <DatePicker
                      selected={filterDate}
                      onChange={(date) => setFilterDate(date)}
                      filterDate={timeFilter === 'Week' ? (date) => date.getDay() === 1 : undefined}
                      showMonthYearPicker={timeFilter === 'Month'}
                      showYearPicker={timeFilter === 'Year'}
                      dateFormat={timeFilter === 'Month' ? 'MM/yyyy' : timeFilter === 'Year' ? 'yyyy' : 'MM/dd/yyyy'}
                      customInput={<CustomDateInput />}
                      popperPlacement="bottom-end"
                    />
                  </div>
                )}
              </>
            )}

            {/* Header Compact Account Avatar & Dropdown */}
            <div className="header-account-container" ref={accountMenuRef}>
              <button
                className="header-account-btn"
                onClick={() => setAccountMenuOpen(prev => !prev)}
                title="Account & Credentials"
              >
                {getInitials(authUser?.name || 'Admin')}
              </button>

              {accountMenuOpen && (
                <div className="header-account-dropdown">
                  <div className="dropdown-user-header">
                    <div className="dropdown-avatar">
                      {getInitials(authUser?.name || 'Admin')}
                    </div>
                    <div className="dropdown-user-info">
                      <span className="dropdown-user-name">{authUser?.name || 'Admin Director'}</span>
                      <span className="dropdown-user-role">
                        {CANONICAL_ROLES.find(r => r.slug === rbacService.normalizeRole(authUser?.role))?.name || (authUser?.role ? String(authUser.role).toUpperCase() : 'Authorized User')}
                      </span>
                    </div>
                  </div>

                  <div className="dropdown-menu-items">
                    <button
                      className="dropdown-item"
                      onClick={() => {
                        setActiveTab('profile');
                        setSelectedSurgeon(null);
                        setAccountMenuOpen(false);
                      }}
                    >
                      <User size={15} style={{ color: '#3b82f6' }} />
                      <span>My Profile & Credentials</span>
                    </button>

                    <button
                      className="dropdown-item"
                      onClick={() => {
                        setActiveTab('settings');
                        setSelectedSurgeon(null);
                        setAccountMenuOpen(false);
                      }}
                    >
                      <Settings size={15} style={{ color: '#10b981' }} />
                      <span>System Settings</span>
                    </button>

                    <div className="dropdown-divider"></div>

                    <button
                      className="dropdown-item dropdown-item-danger"
                      onClick={() => {
                        handleLogout();
                        setAccountMenuOpen(false);
                      }}
                    >
                      <LogOut size={15} />
                      <span>Log Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <section className="page-body">
          {selectedSurgeon ? (
            <SurgeonProfilePage
              surgeonName={selectedSurgeon}
              onBack={() => setSelectedSurgeon(null)}
              activeProfileTab={profileTab}
              setActiveProfileTab={setProfileTab}
              surgeonsDetails={surgeonsDetails}
            />
          ) : (
            <>
              {/* ==========================================
              TAB: BUSINESS ANALYSIS
              ========================================== */}
              {activeTab === 'business_analysis' && (
                <BusinessAnalysis
                  surgeries={filteredSurgeries}
                  orMetrics={orPerformanceMetrics}
                  onSchedule={() => setActiveTab('scheduler')}
                />
              )}
              
              {activeTab === 'caselog_scheduling' && (
                <CaseLogScheduler surgeonsList={surgeonsList} />
              )}

              {/* ==========================================
              TAB: OR BLOCK SCHEDULE
              ========================================== */}
              {activeTab === 'or_block_schedule' && (
                <ORBlockSchedule />
              )}

              {/* ==========================================
              TAB: ASC COMMAND CENTER (MTD CORE)
              ========================================== */}
              {activeTab === 'dashboard' && (
                <>
                  <CommandCenter
                    surgeries={surgeries}
                    onTabChange={setActiveTab}
                    timeframe={timeFilter}
                    filterDate={filterDate}
                    includeAdvancedCosts={includeAdvancedCosts}
                  />

                  {/* Lower Section: Supply cost breakdown, AI suggestions and Cancellation Insights */}
                  <div className="three-column-row">

                    {/* Supply Cost Breakdown */}
                    <div className="dashboard-card">
                      <div className="card-header">
                        <h3 className="card-title">Supply Cost Analysis (MTD)</h3>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '8px', height: '200px', alignItems: 'center' }}>
                        <div style={{ position: 'relative', width: '100%', height: '130px' }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={executiveOverviewMetrics.dynamicSupplyBreakdown || supplyBreakdown}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={55}
                                paddingAngle={2}
                                dataKey="value"
                              >
                                {(executiveOverviewMetrics.dynamicSupplyBreakdown || supplyBreakdown).map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                              {executiveOverviewMetrics.totalDirectCost > 1000 ? '$' + (executiveOverviewMetrics.totalDirectCost / 1000).toFixed(1) + 'k' : '$' + executiveOverviewMetrics.totalDirectCost.toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.55rem', color: 'var(--text-secondary)' }}>Total Cost</div>
                          </div>
                        </div>

                        <div className="donut-legend-container">
                          {(executiveOverviewMetrics.dynamicSupplyBreakdown || supplyBreakdown).map((item, idx) => (
                            <div className="donut-legend-item" key={idx}>
                              <div className="donut-legend-label">
                                <div className="donut-legend-color" style={{ backgroundColor: item.color }} />
                                <span style={{ fontSize: '0.65rem' }}>{item.name}</span>
                              </div>
                              <div className="donut-legend-value">
                                <span className="donut-legend-pct">{item.percentage}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <a className="card-link" href="#" style={{ fontSize: '0.8rem', marginTop: '4px' }} onClick={(e) => { e.preventDefault(); setActiveTab('supply'); }}>View Supply Chain Analytics →</a>
                    </div>

                    {/* AI Recommendations */}
                    <div className="dashboard-card">
                      <div className="card-header">
                        <h3 className="card-title"><Sparkles size={14} className="text-blue" /> AI Recommendations</h3>
                        <span className="ai-badge">3 New</span>
                      </div>

                      <div className="ai-recommendations-list" style={{ display: 'flex', flexDirection: 'column', gap: '2px', height: '180px', overflowY: 'auto' }}>
                        <div className="ai-recommendation-item">
                          <span className="ai-rec-icon">⚡</span>
                          <div className="ai-rec-details">
                            <div className="ai-rec-header">
                              Optimize Block Utilization
                              <span className="ai-rec-impact high">High Impact</span>
                            </div>
                            <span className="ai-rec-desc">3 OR blocks show &lt; 50% utilization. Potential to add 12-15 cases.</span>
                            <span className="ai-rec-est">Est. Impact: $18,400 monthly</span>
                          </div>
                        </div>

                        <div className="ai-recommendation-item">
                          <span className="ai-rec-icon">💲</span>
                          <div className="ai-rec-details">
                            <div className="ai-rec-header">
                              Review Supply Costs
                              <span className="ai-rec-impact med">Medium Impact</span>
                            </div>
                            <span className="ai-rec-desc">Implant costs up 12% vs prior month for similar cases.</span>
                            <span className="ai-rec-est">Est. Impact: $8,200 monthly</span>
                          </div>
                        </div>

                        <div className="ai-recommendation-item">
                          <span className="ai-rec-icon">⏳</span>
                          <div className="ai-rec-details">
                            <div className="ai-rec-header">
                              Reduce Turnover Time
                              <span className="ai-rec-impact med">Medium Impact</span>
                            </div>
                            <span className="ai-rec-desc">3 ORs have turnover &gt; 30 mins. Best practice: 20-25 mins.</span>
                            <span className="ai-rec-est">Est. Impact: $14,600 monthly</span>
                          </div>
                        </div>
                      </div>
                      <a className="card-link" href="#" style={{ fontSize: '0.8rem', marginTop: '4px' }} onClick={(e) => { e.preventDefault(); setActiveTab('ai'); }}>View All Recommendations →</a>
                    </div>

                    {/* Cancellation Recovery Insights */}
                    <div className="dashboard-card">
                      <div className="card-header">
                        <h3 className="card-title">Cancellation Impact Analysis</h3>
                      </div>

                      <div className="cancel-recovery-header">
                        <div className="cancel-stat-box">
                          <span className="cancel-stat-num">12</span>
                          <span className="cancel-stat-label">Cancelled Cases (MTD)</span>
                          <span className="cancel-stat-comparison">vs Prior MTD 8</span>
                        </div>
                        <div className="cancel-stat-box">
                          <span className="cancel-stat-num" style={{ color: 'var(--color-green)' }}>$24,850</span>
                          <span className="cancel-stat-label">Revenue Impact</span>
                          <span className="cancel-stat-comparison">vs Prior MTD $16,200</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div className="cancel-progress-row">
                          <div className="cancel-progress-labels">
                            <span className="cancel-progress-name">Patient Decision (42%)</span>
                            <span className="cancel-progress-val">$10,450</span>
                          </div>
                          <div className="cancel-progress-bar-container">
                            <div className="cancel-progress-bar-fill" style={{ width: '42%' }} />
                          </div>
                        </div>

                        <div className="cancel-progress-row">
                          <div className="cancel-progress-labels">
                            <span className="cancel-progress-name">Insurance Issues (25%)</span>
                            <span className="cancel-progress-val">$6,200</span>
                          </div>
                          <div className="cancel-progress-bar-container">
                            <div className="cancel-progress-bar-fill" style={{ width: '25%' }} />
                          </div>
                        </div>

                        <div className="cancel-progress-row">
                          <div className="cancel-progress-labels">
                            <span className="cancel-progress-name">Medical Clearance (17%)</span>
                            <span className="cancel-progress-val">$4,100</span>
                          </div>
                          <div className="cancel-progress-bar-container">
                            <div className="cancel-progress-bar-fill" style={{ width: '17%' }} />
                          </div>
                        </div>
                      </div>
                      <a className="card-link" href="#" style={{ fontSize: '0.8rem', marginTop: '6px' }} onClick={(e) => { e.preventDefault(); setActiveTab('cancellations'); }}>View Cancellation Analytics →</a>
                    </div>

                  </div>

                  {/* Bottom Table: Profitability Summary */}
                  {/* <div className="dashboard-card">
                    <div className="card-header">
                      <h3 className="card-title">Financial Performance Summary (MTD)</h3>
                      <span className="card-subtitle-note">Last updated: May 29, 2026 8:30 AM</span>
                    </div>

                    <div className="custom-table-container">
                      <table className="custom-table">
                        <thead>
                          <tr>
                            <th>Location</th>
                            <th>Cases</th>
                            <th>Revenue</th>
                            <th>Total Costs</th>
                            <th>Net Margin $</th>
                            <th>Net Margin %</th>
                            <th>OR Utilization %</th>
                            <th>Profitable Util %</th>
                            <th>Rev per OR Hour</th>
                            <th>Margin per OR Hour</th>
                            <th>Trend</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profitabilitySummary.map(sum => (
                            <tr key={sum.location}>
                              <td style={{ fontWeight: '600' }}>{sum.location}</td>
                              <td>{sum.cases}</td>
                              <td>${sum.rev.toLocaleString()}</td>
                              <td>${sum.cost.toLocaleString()}</td>
                              <td style={{ color: 'var(--color-green)', fontWeight: '600' }}>${sum.margin.toLocaleString()}</td>
                              <td>{sum.marginPct}%</td>
                              <td>{sum.util}%</td>
                              <td>{sum.profUtil}%</td>
                              <td>${sum.revHour.toLocaleString()}</td>
                              <td>${sum.marginHour.toLocaleString()}</td>
                              <td><span style={{ color: 'var(--color-green)' }}>▲</span></td>
                            </tr>
                          ))}
                          <tr className="total-row">
                            <td>Total</td>
                            <td>1,534</td>
                            <td>$1,898,090</td>
                            <td>$1,734,826</td>
                            <td style={{ color: 'var(--color-green)' }}>$163,264</td>
                            <td>8.6%</td>
                            <td>62.4%</td>
                            <td>51.3%</td>
                            <td>$1,102</td>
                            <td>$208</td>
                            <td><span style={{ color: 'var(--color-green)' }}>▲</span></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div> */}
                </>
              )}

              {/* ==========================================
              TAB: EXECUTIVE OVERVIEW
              ========================================== */}
              {activeTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                  {/* 4 KPI Cards Row */}
                  <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                    <div className="kpi-card">
                      <div className="kpi-card-header">
                        <span className="kpi-label">Net Revenue</span>
                        <div className="kpi-icon-container blue"><DollarSign size={12} /></div>
                      </div>
                      <span className="kpi-value">{executiveOverviewMetrics.netRevenue.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                      <div className="kpi-trend positive">
                        Real-time <span className="kpi-trend-change">{executiveOverviewMetrics.totalCases} cases logged</span>
                      </div>
                      <div className="sparkline-container">
                        <svg viewBox="0 0 100 30" width="100%" height="100%" preserveAspectRatio="none">
                          <path d="M0,28 L30,22 L60,14 L100,5" fill="none" stroke="var(--color-green)" strokeWidth="2" />
                        </svg>
                      </div>
                    </div>

                    <div className="kpi-card">
                      <div className="kpi-card-header">
                        <span className="kpi-label">Operating Margin</span>
                        <div className="kpi-icon-container green"><TrendingUp size={12} /></div>
                      </div>
                      <span className="kpi-value">{executiveOverviewMetrics.operatingMargin.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                      <div className="kpi-trend positive">
                        Margin Ratio <span className="kpi-trend-change">{(executiveOverviewMetrics.ebitdaPct)}%</span>
                      </div>
                      <div className="sparkline-container">
                        <svg viewBox="0 0 100 30" width="100%" height="100%" preserveAspectRatio="none">
                          <path d="M0,25 Q30,12 60,18 T100,8" fill="none" stroke="var(--color-green)" strokeWidth="2" />
                        </svg>
                      </div>
                    </div>

                    <div className="kpi-card">
                      <div className="kpi-card-header">
                        <span className="kpi-label">Avg Contribution / Case</span>
                        <div className="kpi-icon-container blue"><Stethoscope size={12} /></div>
                      </div>
                      <span className="kpi-value">{executiveOverviewMetrics.avgContribution.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                      <div className="kpi-trend positive">
                        Profitable Rate <span className="kpi-trend-change">{executiveOverviewMetrics.totalCases > 0 ? Math.round((executiveOverviewMetrics.profitableCases / executiveOverviewMetrics.totalCases) * 100) : 0}% ({executiveOverviewMetrics.profitableCases} cases)</span>
                      </div>
                      <div className="sparkline-container">
                        <svg viewBox="0 0 100 30" width="100%" height="100%" preserveAspectRatio="none">
                          <path d="M0,28 L35,20 L70,10 L100,5" fill="none" stroke="var(--color-green)" strokeWidth="2" />
                        </svg>
                      </div>
                    </div>

                    <div className="kpi-card">
                      <div className="kpi-card-header">
                        <span className="kpi-label">EBITDA Margin</span>
                        <div className="kpi-icon-container orange"><DollarSign size={12} /></div>
                      </div>
                      <span className="kpi-value">{executiveOverviewMetrics.ebitdaPct}%</span>
                      <div className="kpi-trend positive">
                        Operating Cost Ratio <span className="kpi-trend-change">{executiveOverviewMetrics.costRatioPct}%</span>
                      </div>
                      <div className="sparkline-container">
                        <svg viewBox="0 0 100 30" width="100%" height="100%" preserveAspectRatio="none">
                          <path d="M0,25 Q15,10 40,22 T80,8 T100,5" fill="none" stroke="var(--color-blue)" strokeWidth="2" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Grid Section: Weekly Financial Trends vs Specialty Splits */}
                  <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }}>

                    {/* Financial Trends combination chart */}
                    <div className="dashboard-card" style={{ display: 'flex', flexDirection: 'column' }}>
                      <div className="card-header">
                        <h3 className="card-title">Weekly Financial Performance</h3>
                      </div>
                      <div style={{ width: '100%', height: '240px', marginTop: '10px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={executiveOverviewMetrics.financialsTrend} margin={{ top: 10, right: 5, left: -20, bottom: 5 }}>
                            <XAxis dataKey="name" stroke="#5e6c84" fontSize={10} tickLine={false} />
                            <YAxis domain={[0, (dataMax) => Math.ceil((Number(dataMax) || 10000) * 1.15 / 50000) * 50000]} allowDataOverflow={true} stroke="#5e6c84" fontSize={10} tickLine={false} />
                            <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', fontSize: '11px', color: 'var(--text-primary)' }} />
                            <Legend />
                            <Bar dataKey="revenue" fill="var(--color-blue)" name="Gross Revenue" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="cost" fill="var(--color-grey)" name="Operating Costs" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Specialty Case Distribution Donut */}
                    <div className="dashboard-card">
                      <div className="card-header">
                        <h3 className="card-title">Case Distribution</h3>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.3fr', gap: '8px', height: '240px', alignItems: 'center' }}>
                        <div style={{ position: 'relative', width: '100%', height: '140px' }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={executiveOverviewMetrics.specialtyDist}
                                cx="50%"
                                cy="50%"
                                innerRadius={45}
                                outerRadius={60}
                                paddingAngle={2}
                                dataKey="value"
                              >
                                {executiveOverviewMetrics.specialtyDist.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)' }}>{filteredSurgeries.length.toLocaleString()}</div>
                            <div style={{ fontSize: '0.55rem', color: 'var(--text-secondary)' }}>Total Cases</div>
                          </div>
                        </div>

                        <div className="donut-legend-container" style={{ overflowY: 'auto', maxHeight: '200px' }}>
                          {executiveOverviewMetrics.specialtyDist.map((item, idx) => (
                            <div className="donut-legend-item" key={idx}>
                              <div className="donut-legend-label">
                                <div className="donut-legend-color" style={{ backgroundColor: item.color }} />
                                <span style={{ fontSize: '0.65rem' }}>{item.name}</span>
                              </div>
                              <div className="donut-legend-value">
                                <span>{item.value}</span>
                                <span className="donut-legend-pct">{item.percentage}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* AI Strategic briefing panel */}
                  <div
                    style={{
                      backgroundColor: 'rgba(59, 130, 246, 0.05)',
                      border: '1px solid var(--border-color)',
                      borderLeft: '4px solid var(--color-blue)',
                      borderRadius: '8px',
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ color: 'var(--color-blue)', fontSize: '1.5rem' }}>
                        <Sparkles />
                      </div>
                      <div>
                        <h4 style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                          Executive Insights & Recommendations
                        </h4>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0', lineHeight: '1.4' }}>
                          1. <strong>Top Specialty Performance:</strong> {executiveOverviewMetrics.topSpecialty ? `${executiveOverviewMetrics.topSpecialty.name} leads volume with ${executiveOverviewMetrics.topSpecialty.value} completed cases generating ${executiveOverviewMetrics.topSpecialty.revenue.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} in gross billing.` : 'No specialty data available.'}<br />
                          2. <strong>Facility Scorecard Highlight:</strong> {executiveOverviewMetrics.topFacility ? `${executiveOverviewMetrics.topFacility.name} is operating at ${executiveOverviewMetrics.topFacility.util}% capacity with a net financial margin contribution of ${executiveOverviewMetrics.topFacility.netMargin.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}.` : 'No facility data available.'}<br />
                          3. <strong>Operational Cost Efficiency:</strong> Total recorded case expenditure across all logs stands at {executiveOverviewMetrics.totalDirectCost.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} ({executiveOverviewMetrics.costRatioPct}% of gross revenue), with an average per-case net contribution of {executiveOverviewMetrics.avgContribution.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}.
                        </p>
                      </div>
                    </div>
                    <button
                      className="btn-header btn-primary"
                      onClick={() => { setActiveTab('ai'); alert('Navigated to AI Prescriptive Action Center.'); }}
                    >
                      Go to Action Hub
                    </button>
                  </div>

                  {/* Facility Comparative Scoreboard table */}
                  <div className="dashboard-card">
                    <div className="card-header">
                      <h3 className="card-title">ASC Facility Scorecard</h3>
                      <span className="card-subtitle-note">Last updated: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>

                    <div className="custom-table-container">
                      <table className="custom-table">
                        <thead>
                          <tr>
                            <th>Facility Location</th>
                            <th>Completed Cases</th>
                            <th>OR Utilization %</th>
                            <th>Profitable Util %</th>
                            <th>Gross Revenue</th>
                            <th>Direct Cost</th>
                            <th>Net Margin</th>
                            <th>Cancellations</th>
                          </tr>
                        </thead>
                        <tbody>
                          {executiveOverviewMetrics.facilityComparative.map(facility => (
                            <tr key={facility.name}>
                              <td style={{ fontWeight: '600' }}>{facility.name}</td>
                              <td>{facility.cases}</td>
                              <td>{facility.util}%</td>
                              <td>{facility.profitUtil}%</td>
                              <td>{facility.revenue.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
                              <td>{facility.directCost.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
                              <td style={{ color: 'var(--color-green)', fontWeight: '600' }}>{facility.netMargin.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
                              <td style={{ color: facility.cancellations > 4 ? 'var(--color-red)' : 'var(--text-primary)' }}>{facility.cancellations} cases</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              )}

              {/* ==========================================
              TAB: OR PERFORMANCE
              ========================================== */}
              {activeTab === 'or' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                    <div className="kpi-card">
                      <span className="kpi-label">Average Turnover Time</span>
                      <span className="kpi-value">{orPerformanceMetrics.avgTurnover} mins</span>
                      <span className="kpi-trend positive">↗ Across {orPerformanceMetrics.turnoverCount} logged turnovers</span>
                    </div>
                    <div className="kpi-card">
                      <span className="kpi-label">Unused Block Time</span>
                      <span className="kpi-value">{orPerformanceMetrics.leakageHrs} hrs</span>
                      <span className="kpi-trend negative">↘ Calculated operational leakage</span>
                    </div>
                    <div className="kpi-card">
                      <span className="kpi-label">Scheduling Gaps (&gt;30m)</span>
                      <span className="kpi-value">{orPerformanceMetrics.gaps} Gaps</span>
                      <span className="kpi-trend positive">↗ Across {orPerformanceMetrics.operatingDaysCount} operating days</span>
                    </div>
                    <div className="kpi-card">
                      <span className="kpi-label">Overtime Hours</span>
                      <span className="kpi-value">{orPerformanceMetrics.ovHrs} hrs</span>
                      <span className="kpi-trend positive">↗ {orPerformanceMetrics.overtimeCases} cases exceeded scheduled block</span>
                    </div>
                  </div>

                  <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }}>
                    <div className="dashboard-card">
                      <div className="card-header">
                        <h3 className="card-title">Room Utilization % by OR</h3>
                      </div>
                      <div style={{ height: '240px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', padding: '20px 0' }}>
                        {orPerformanceMetrics.roomUtilization.length > 0 ? (
                          orPerformanceMetrics.roomUtilization.map(item => (
                            <div key={item.room} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', height: '100%' }}>
                              <div style={{ display: 'flex', alignItems: 'flex-end', height: '180px', width: '32px', backgroundColor: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ height: `${item.val}%`, width: '100%', backgroundColor: item.color, transition: 'height 0.5s ease' }} />
                              </div>
                              <span style={{ fontSize: '0.8rem', fontWeight: '600' }}>{item.room}</span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.val}%</span>
                            </div>
                          ))
                        ) : (
                          <div style={{ width: '100%', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            No room utilization data for this timeframe.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="dashboard-card">
                      <div className="card-header">
                        <h3 className="card-title">Under-Utilization Root Causes</h3>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {orPerformanceMetrics.rootCauses.map((cause, idx) => (
                          <React.Fragment key={idx}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                              <span>{cause.name}</span>
                              <span style={{ fontWeight: '600' }}>{cause.pct}%</span>
                            </div>
                            <div style={{ height: '8px', width: '100%', backgroundColor: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${cause.pct}%`, backgroundColor: cause.color, transition: 'width 0.5s ease' }} />
                            </div>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Row 3: Visual Pie / Donut Charts for Operational Performance */}
                  <div className="three-column-row">

                    {/* Under-Utilization Root Causes Pie */}
                    <div className="dashboard-card">
                      <div className="card-header">
                        <h3 className="card-title">Root Cause Analysis</h3>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.3fr', gap: '8px', height: '200px', alignItems: 'center' }}>
                        <div style={{ position: 'relative', width: '100%', height: '130px' }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', fontSize: '10px', color: 'var(--text-primary)' }} />
                              <Pie
                                data={orPerformanceMetrics.rootCausesPie || MOCK_OR_ROOT_CAUSES_PIE}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={55}
                                paddingAngle={2}
                                dataKey="value"
                              >
                                {(orPerformanceMetrics.rootCausesPie || MOCK_OR_ROOT_CAUSES_PIE).map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)' }}>{orPerformanceMetrics.leakageHrs}h</div>
                            <div style={{ fontSize: '0.5rem', color: 'var(--text-secondary)' }}>Delays</div>
                          </div>
                        </div>

                        <div className="donut-legend-container">
                          {(orPerformanceMetrics.rootCausesPie || MOCK_OR_ROOT_CAUSES_PIE).map((item, idx) => (
                            <div className="donut-legend-item" key={idx}>
                              <div className="donut-legend-label">
                                <div className="donut-legend-color" style={{ backgroundColor: item.color }} />
                                <span style={{ fontSize: '0.65rem' }}>{item.name}</span>
                              </div>
                              <div className="donut-legend-value">
                                <span className="donut-legend-pct">{item.percentage}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* OR Block Allocation Donut */}
                    <div className="dashboard-card">
                      <div className="card-header">
                        <h3 className="card-title">OR Block Allocations</h3>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.3fr', gap: '8px', height: '200px', alignItems: 'center' }}>
                        <div style={{ position: 'relative', width: '100%', height: '130px' }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', fontSize: '10px', color: 'var(--text-primary)' }} />
                              <Pie
                                data={orPerformanceMetrics.blockAllocPie || MOCK_OR_BLOCK_ALLOC_PIE}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={55}
                                paddingAngle={2}
                                dataKey="value"
                              >
                                {(orPerformanceMetrics.blockAllocPie || MOCK_OR_BLOCK_ALLOC_PIE).map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-primary)' }}>{orPerformanceMetrics.leakageHrs}h</div>
                            <div style={{ fontSize: '0.5rem', color: 'var(--text-secondary)' }}>Leakage</div>
                          </div>
                        </div>

                        <div className="donut-legend-container">
                          {(orPerformanceMetrics.blockAllocPie || MOCK_OR_BLOCK_ALLOC_PIE).map((item, idx) => (
                            <div className="donut-legend-item" key={idx}>
                              <div className="donut-legend-label">
                                <div className="donut-legend-color" style={{ backgroundColor: item.color }} />
                                <span style={{ fontSize: '0.65rem' }}>{item.name}</span>
                              </div>
                              <div className="donut-legend-value">
                                <span className="donut-legend-pct">{item.percentage}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Turnover Efficiency splits Pie */}
                    <div className="dashboard-card">
                      <div className="card-header">
                        <h3 className="card-title">Turnover Time Distribution</h3>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.3fr', gap: '8px', height: '200px', alignItems: 'center' }}>
                        <div style={{ position: 'relative', width: '100%', height: '130px' }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', fontSize: '10px', color: 'var(--text-primary)' }} />
                              <Pie
                                data={orPerformanceMetrics.turnoverEffPie || MOCK_OR_TURNOVER_EFF_PIE}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={55}
                                paddingAngle={2}
                                dataKey="value"
                              >
                                {(orPerformanceMetrics.turnoverEffPie || MOCK_OR_TURNOVER_EFF_PIE).map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)' }}>{orPerformanceMetrics.avgTurnover}m</div>
                            <div style={{ fontSize: '0.5rem', color: 'var(--text-secondary)' }}>Avg Time</div>
                          </div>
                        </div>

                        <div className="donut-legend-container">
                          {(orPerformanceMetrics.turnoverEffPie || MOCK_OR_TURNOVER_EFF_PIE).map((item, idx) => (
                            <div className="donut-legend-item" key={idx}>
                              <div className="donut-legend-label">
                                <div className="donut-legend-color" style={{ backgroundColor: item.color }} />
                                <span style={{ fontSize: '0.65rem' }}>{item.name}</span>
                              </div>
                              <div className="donut-legend-value">
                                <span className="donut-legend-pct">{item.percentage}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {/* ==========================================
              TAB: SURGEON PERFORMANCE
              ========================================== */}
              {activeTab === 'surgeons' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="dashboard-card">
                    <div className="card-header">
                      <h3 className="card-title">Surgeon Efficiency & Financial Contribution</h3>
                      <button className="btn-header">Print Reports</button>
                    </div>

                    <div className="custom-table-container">
                      <table className="custom-table">
                        <thead>
                          <tr>
                            <th>Surgeon</th>
                            <th>Cases Done</th>
                            <th>Avg Procedure Duration</th>
                            <th>Avg Turnover Time</th>
                            <th>Supply Variance</th>
                            <th>Total Revenue</th>
                            <th>Total Supplies</th>
                            <th>Net Margin Contribution</th>
                            <th>Avg Margin / Case</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dynamicSurgeonTableData.map(surg => (
                            <tr
                              key={surg.name}
                              onClick={() => { setSelectedSurgeon(surg.name); setProfileTab('overview'); }}
                              style={{ cursor: 'pointer' }}
                              className="clickable-row"
                            >
                              <td>
                                <div className="doctor-avatar-row">
                                  <div className="doctor-tiny-avatar" style={{ backgroundColor: surg.color }}></div>
                                  <span style={{ fontWeight: '600', color: 'var(--color-blue)' }}>{surg.name}</span>
                                </div>
                              </td>
                              <td>{surg.cases}</td>
                              <td>{surg.proced}</td>
                              <td style={{ color: parseInt(surg.turn) > 20 ? 'var(--color-orange)' : 'var(--text-primary)' }}>{surg.turn}</td>
                              <td style={{ color: surg.variance.startsWith('+') ? 'var(--color-red)' : 'var(--color-green)', fontWeight: '600' }}>
                                {surg.variance}
                              </td>
                              <td>${Number(surg.rev || 0).toLocaleString('en-US')}</td>
                              <td>${Number(surg.supply || 0).toLocaleString('en-US')}</td>
                              <td style={{ color: 'var(--color-green)', fontWeight: '700' }}>${Number(surg.margin || 0).toLocaleString('en-US')}</td>
                              <td style={{ fontWeight: '600' }}>${Number(surg.avg || 0).toLocaleString('en-US')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ==========================================
              TAB: PATIENT MANAGEMENT
              ========================================== */}
              {activeTab === 'patients' && (
                <div className="dashboard-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="card-header" style={{ marginBottom: '4px' }}>
                    <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Users size={16} style={{ color: 'var(--color-blue)' }} />
                      ASC Database Patient Directory
                    </h3>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Showing {filteredPatients.length} of {patients.length} records
                      </span>
                      <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
                        <input
                          type="text"
                          placeholder="Search name, MRN, provider..."
                          className="date-range-selector"
                          style={{ paddingLeft: '30px', width: '260px' }}
                          value={patientSearchQuery}
                          onChange={(e) => {
                            setPatientSearchQuery(e.target.value);
                            setPatientPage(1);
                          }}
                        />
                      </div>
                      {patientSearchQuery && (
                        <button
                          className="btn-header"
                          onClick={() => {
                            setPatientSearchQuery('');
                            setPatientPage(1);
                          }}
                          style={{ minWidth: 'fit-content' }}
                        >
                          Clear
                        </button>
                      )}
                      <button
                        className="btn-header"
                        onClick={handleExportPatients}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 'fit-content' }}
                      >
                        <Download size={14} /> Download
                      </button>
                      <button
                        className="btn-header btn-primary"
                        onClick={handleOpenAddPatient}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 'fit-content' }}
                      >
                        <Plus size={14} /> Add Patient
                      </button>
                    </div>
                  </div>

                  <div className="custom-table-container" style={{ overflowX: 'hidden' }}>
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th onClick={() => handlePatientSort('mrn')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                            MRN {patientSortField === 'mrn' ? (patientSortDirection === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th onClick={() => handlePatientSort('name')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                            Patient Name {patientSortField === 'name' ? (patientSortDirection === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th>DOB</th>
                          <th>Gender</th>
                          <th>Insurance Provider</th>
                          <th style={{ textAlign: 'center' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedPatients.length > 0 ? (
                          paginatedPatients.map(patient => (
                            <tr key={patient.id || patient.mrn} className="clickable-row">
                              <td style={{ fontWeight: '600', fontFamily: 'monospace', color: 'var(--color-blue)', letterSpacing: '0.5px' }}>
                                #{canViewPHI ? patient.mrn : maskMRN(patient.mrn)}
                              </td>
                              <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <div style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '50%',
                                    backgroundColor: patient.gender === 'Female' ? 'rgba(236, 72, 153, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                                    color: patient.gender === 'Female' ? 'var(--color-pink)' : 'var(--color-blue)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.8rem',
                                    fontWeight: '700',
                                    border: `1px solid ${patient.gender === 'Female' ? 'rgba(236, 72, 153, 0.2)' : 'rgba(59, 130, 246, 0.2)'}`
                                  }}>
                                    {canViewPHI ? (patient.name ? patient.name.trim().charAt(0) : '?') : '*'}
                                  </div>
                                  {canViewPHI ? (patient.name ? patient.name.trim() : '') : maskPatientName(patient.name)}
                                </div>
                              </td>
                              <td style={{ whiteSpace: 'nowrap' }}>{canViewPHI ? patient.dob : maskDOB(patient.dob)}</td>
                              <td>
                                <span style={{
                                  padding: '4px 10px',
                                  borderRadius: '12px',
                                  fontSize: '0.7rem',
                                  fontWeight: '600',
                                  backgroundColor: patient.gender === 'Female' ? 'rgba(236, 72, 153, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                                  color: patient.gender === 'Female' ? 'var(--color-pink)' : 'var(--color-blue)',
                                  border: `1px solid ${patient.gender === 'Female' ? 'rgba(236, 72, 153, 0.15)' : 'rgba(59, 130, 246, 0.15)'}`
                                }}>
                                  {patient.gender}
                                </span>
                              </td>
                              <td style={{ fontWeight: '500' }}>{patient.insurance_provider}</td>
                              <td>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                  <button
                                    onClick={() => handleOpenEditPatient(patient)}
                                    className="btn-header"
                                    style={{ padding: '4px 8px', minWidth: 'auto', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid rgba(59, 130, 246, 0.3)', color: 'var(--color-blue)' }}
                                    title="Edit Patient"
                                  >
                                    <Edit size={12} />
                                  </button>
                                  <button
                                    onClick={() => handleDeletePatient(patient)}
                                    className="btn-header"
                                    style={{ padding: '4px 8px', minWidth: 'auto', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid rgba(244, 63, 94, 0.3)', color: 'var(--color-red)' }}
                                    title="Delete Patient"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="6" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
                              <Users size={32} style={{ opacity: 0.2, marginBottom: '12px' }} />
                              <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>No patients match search criteria</div>
                              <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>Try adjusting your keyword filter or clear the query</div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Limit & Pagination Controls Footer */}
                  <div className="table-footer" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: '10px',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--border-light)',
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>Rows per page:</span>
                      <select
                        className="date-range-selector"
                        style={{ height: '32px', background: 'var(--bg-card)', padding: '2px 8px', width: '70px', cursor: 'pointer' }}
                        value={patientLimit}
                        onChange={(e) => {
                          setPatientLimit(Number(e.target.value));
                          setPatientPage(1);
                        }}
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                      <span style={{ marginLeft: '12px' }}>
                        Showing {filteredPatients.length > 0 ? startIndex + 1 : 0}–{Math.min(filteredPatients.length, endIndex)} of {filteredPatients.length} records
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        className="btn-header"
                        style={{ height: '32px', padding: '0 10px', minWidth: 'auto', cursor: patientPage === 1 ? 'not-allowed' : 'pointer', opacity: patientPage === 1 ? 0.5 : 1 }}
                        disabled={patientPage === 1}
                        onClick={() => setPatientPage(prev => Math.max(1, prev - 1))}
                      >
                        Previous
                      </button>

                      {renderPageNumbers()}

                      <button
                        className="btn-header"
                        style={{ height: '32px', padding: '0 10px', minWidth: 'auto', cursor: patientPage === totalPages ? 'not-allowed' : 'pointer', opacity: patientPage === totalPages ? 0.5 : 1 }}
                        disabled={patientPage === totalPages}
                        onClick={() => setPatientPage(prev => Math.min(totalPages, prev + 1))}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'staff_manage' && (
                <StaffManagement />
              )}

              {activeTab === 'surgeons_manage' && (
                <div className="dashboard-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="card-header" style={{ marginBottom: '4px' }}>
                    <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <UserCheck size={16} style={{ color: 'var(--color-blue)' }} />
                      ASC Database Surgeon Directory
                    </h3>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Showing {filteredSurgeons.length} of {surgeonsList.length} records
                      </span>
                      <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
                        <input
                          type="text"
                          placeholder="Search name, NPI, specialty..."
                          className="date-range-selector"
                          style={{ paddingLeft: '30px', width: '260px' }}
                          value={surgeonSearchQuery}
                          onChange={(e) => {
                            setSurgeonSearchQuery(e.target.value);
                            setSurgeonPage(1);
                          }}
                        />
                      </div>
                      {surgeonSearchQuery && (
                        <button
                          className="btn-header"
                          onClick={() => {
                            setSurgeonSearchQuery('');
                            setSurgeonPage(1);
                          }}
                          style={{ minWidth: 'fit-content' }}
                        >
                          Clear
                        </button>
                      )}
                      <button
                        className="btn-header"
                        onClick={handleExportSurgeons}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 'fit-content' }}
                      >
                        <Download size={14} /> Download
                      </button>
                      <button
                        className="btn-header btn-primary"
                        onClick={handleOpenAddSurgeon}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 'fit-content' }}
                      >
                        <Plus size={14} /> Add Surgeon
                      </button>
                    </div>
                  </div>

                  <div className="custom-table-container" style={{ overflowX: 'hidden' }}>
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th onClick={() => handleSurgeonSort('license')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                            NPI / License {surgeonSortField === 'license' ? (surgeonSortDirection === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th onClick={() => handleSurgeonSort('name')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                            Surgeon Name {surgeonSortField === 'name' ? (surgeonSortDirection === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th>Specialty</th>
                          <th>Email</th>
                          <th>Phone</th>
                          <th style={{ textAlign: 'center' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedSurgeons.length > 0 ? (
                          paginatedSurgeons.map(surgeon => (
                            <tr key={surgeon.id} className="clickable-row">
                              <td style={{ fontWeight: '600', fontFamily: 'monospace', color: 'var(--color-blue)', letterSpacing: '0.5px' }}>
                                {surgeon.license_number}
                              </td>
                              <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <div style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '50%',
                                    backgroundColor: 'rgba(139, 92, 246, 0.12)',
                                    color: '#8b5cf6',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.8rem',
                                    fontWeight: '700',
                                    border: '1px solid rgba(139, 92, 246, 0.2)'
                                  }}>
                                    {surgeon.firstname ? surgeon.firstname.trim().charAt(0) : '?'}
                                  </div>
                                  {surgeon.name || `Dr. ${surgeon.lastname || ''} ${surgeon.firstname || ''}`}
                                </div>
                              </td>
                              <td style={{ fontWeight: '500' }}>{surgeon.specialty}</td>
                              <td>{surgeon.email}</td>
                              <td style={{ whiteSpace: 'nowrap' }}>{surgeon.phone}</td>
                              <td>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                  <button
                                    onClick={() => handleOpenEditSurgeon(surgeon)}
                                    className="btn-header"
                                    style={{ padding: '4px 8px', minWidth: 'auto', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid rgba(59, 130, 246, 0.3)', color: 'var(--color-blue)' }}
                                    title="Edit Surgeon"
                                  >
                                    <Edit size={12} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteSurgeon(surgeon)}
                                    className="btn-header"
                                    style={{ padding: '4px 8px', minWidth: 'auto', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid rgba(244, 63, 94, 0.3)', color: 'var(--color-red)' }}
                                    title="Delete Surgeon"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="6" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
                              <UserCheck size={32} style={{ opacity: 0.2, marginBottom: '12px' }} />
                              <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>No surgeons match search criteria</div>
                              <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>Try adjusting your keyword filter or clear the query</div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Limit & Pagination Controls Footer */}
                  <div className="table-footer" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: '10px',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--border-light)',
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>Rows per page:</span>
                      <select
                        className="date-range-selector"
                        style={{ height: '32px', background: 'var(--bg-card)', padding: '2px 8px', width: '70px', cursor: 'pointer' }}
                        value={surgeonLimit}
                        onChange={(e) => {
                          setSurgeonLimit(Number(e.target.value));
                          setSurgeonPage(1);
                        }}
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                      <span style={{ marginLeft: '12px' }}>
                        Showing {filteredSurgeons.length > 0 ? surgeonStartIndex + 1 : 0}–{Math.min(filteredSurgeons.length, surgeonEndIndex)} of {filteredSurgeons.length} records
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        className="btn-header"
                        style={{ height: '32px', padding: '0 10px', minWidth: 'auto', cursor: surgeonPage === 1 ? 'not-allowed' : 'pointer', opacity: surgeonPage === 1 ? 0.5 : 1 }}
                        disabled={surgeonPage === 1}
                        onClick={() => setSurgeonPage(prev => Math.max(1, prev - 1))}
                      >
                        Previous
                      </button>

                      {renderSurgeonPageNumbers()}

                      <button
                        className="btn-header"
                        style={{ height: '32px', padding: '0 10px', minWidth: 'auto', cursor: surgeonPage === surgeonTotalPages ? 'not-allowed' : 'pointer', opacity: surgeonPage === surgeonTotalPages ? 0.5 : 1 }}
                        disabled={surgeonPage === surgeonTotalPages}
                        onClick={() => setSurgeonPage(prev => Math.min(surgeonTotalPages, prev + 1))}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ==========================================
              TAB: FINANCIAL PERFORMANCE
              ========================================== */}
              {activeTab === 'financial' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="dashboard-card">
                    <div className="card-header">
                      <h3 className="card-title">Facility Financial Analytics</h3>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Visual ledger summaries of monthly expenditures, room utility margins, and net EBITDA profit indicators.
                    </p>
                  </div>
                </div>
              )}

              {/* ==========================================
              TAB: CASE PROFITABILITY
              ========================================== */}
              {activeTab === 'cpt' && (
                <div className="dashboard-card">
                  <div className="card-header">
                    <h3 className="card-title">Ambulatory Surgery Code Financial Base</h3>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
                        <input
                          type="text"
                          placeholder="Search CPT code..."
                          className="date-range-selector"
                          style={{ paddingLeft: '30px' }}
                        />
                      </div>
                      <button className="btn-header">Add CPT Code</button>
                    </div>
                  </div>

                  <div className="custom-table-container">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>CPT Code</th>
                          <th>Description</th>
                          <th>Avg Duration</th>
                          <th>Avg Turnover</th>
                          <th>Facility Fee</th>
                          <th>Medicare Rate</th>
                          <th>Labor Cost</th>
                          <th>Implants / Supplies</th>
                          <th>Contrib. Margin</th>
                          <th>EBITDA %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cptTableData.map(cpt => (
                          <tr key={cpt.code}>
                            <td style={{ fontWeight: '600' }}>{cpt.code}</td>
                            <td>{cpt.desc}</td>
                            <td>{cpt.time} mins</td>
                            <td>{cpt.turn} mins</td>
                            <td>${cpt.fee.toLocaleString()}</td>
                            <td>${cpt.med.toLocaleString()}</td>
                            <td>${cpt.labor.toLocaleString()}</td>
                            <td>${cpt.supply.toLocaleString()}</td>
                            <td style={{ color: 'var(--color-green)', fontWeight: '700' }}>${cpt.margin.toLocaleString()}</td>
                            <td style={{ fontWeight: '600' }}>{cpt.pct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ==========================================
              TAB: PAYER INTELLIGENCE
              ========================================== */}
              {activeTab === 'payer' && (
                <div className="dashboard-card">
                  <div className="card-header">
                    <h3 className="card-title">Payer Intelligence</h3>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Reimbursement cycles, collection logs, and margin details by insurance provider (Medicare, Commercial, etc.).
                  </p>
                </div>
              )}

              {/* ==========================================
              TAB: SUPPLY CHAIN
              ========================================== */}
              {activeTab === 'supply' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                  {/* Supply KPI insights */}
                  <div className="kpi-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                    <div className="kpi-card">
                      <span className="kpi-label">Annual Standardization Saving Opportunity</span>
                      <span className="kpi-value" style={{ color: 'var(--color-green)' }}>$84,500</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Standardizing implant suppliers & sutures</span>
                    </div>
                    <div className="kpi-card">
                      <span className="kpi-label">Implant Supply Variance</span>
                      <span className="kpi-value" style={{ color: 'var(--color-red)' }}>+14.8%</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Above preference card baseline standard</span>
                    </div>
                    <div className="kpi-card">
                      <span className="kpi-label">Waste Reduction Score</span>
                      <span className="kpi-value">92 / 100</span>
                      <span className="kpi-trend positive">↗ +4pts vs last quarter</span>
                    </div>
                  </div>

                  {/* Preference cards & surgeon variance breakdown */}
                  {PREFERENCE_CARDS.map(card => (
                    <div className="dashboard-card" key={card.procedure}>
                      <div className="card-header">
                        <h3 className="card-title"><Package size={16} /> Preference Card Analysis: {card.procedure}</h3>
                        <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>Standard Cost Base: ${card.standardCost}</span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '20px' }}>
                        <div>
                          <h4 style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Standard Supply Item List</h4>
                          <div className="custom-table-container" style={{ border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                            <table className="custom-table" style={{ fontSize: '0.8rem' }}>
                              <thead>
                                <tr>
                                  <th>Item Name</th>
                                  <th>Qty</th>
                                  <th>Unit Cost</th>
                                </tr>
                              </thead>
                              <tbody>
                                {card.items.map(item => (
                                  <tr key={item.name}>
                                    <td>{item.name}</td>
                                    <td>{item.qty}</td>
                                    <td>${item.cost}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div>
                          <h4 style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Surgeon Utilization Variance</h4>
                          <div className="custom-table-container" style={{ border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                            <table className="custom-table" style={{ fontSize: '0.8rem' }}>
                              <thead>
                                <tr>
                                  <th>Surgeon</th>
                                  <th>Actual Cost</th>
                                  <th>Variance %</th>
                                  <th>Items Opened</th>
                                  <th>Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {card.surgeons.map(surg => (
                                  <tr
                                    key={surg.name}
                                    onClick={() => { setSelectedSurgeon(surg.name); setProfileTab('supply'); }}
                                    style={{ cursor: 'pointer' }}
                                    className="clickable-row"
                                  >
                                    <td style={{ fontWeight: '600', color: 'var(--color-blue)' }}>{surg.name}</td>
                                    <td>${surg.actualCost}</td>
                                    <td style={{ color: surg.variance > 0 ? 'var(--color-red)' : 'var(--color-green)', fontWeight: '600' }}>
                                      {surg.variance > 0 ? `+${surg.variance}%` : `${surg.variance}%`}
                                    </td>
                                    <td>{surg.supplyItems} items</td>
                                    <td>
                                      {surg.variance > 10 && (
                                        <button
                                          className="btn-header"
                                          style={{ padding: '2px 6px', fontSize: '0.7rem', borderColor: 'var(--color-orange)', color: 'var(--color-orange)' }}
                                          onClick={(e) => { e.stopPropagation(); alert(`Standardization recommendation email sent to ${surg.name}`); }}
                                        >
                                          Standardize
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ==========================================
              TAB: CANCELLATIONS
              ========================================== */}
              {activeTab === 'cancellations' && (() => {
                const totalCases = filteredSurgeries.length;
                const cancelledSurgeriesList = filteredSurgeries.filter(s => s.status?.toLowerCase() === 'cancelled' || s.status?.toLowerCase() === 'canceled' || s.marginType === 'cancelled');
                const cancelledCount = cancelledSurgeriesList.length;
                const cancelRate = totalCases > 0 ? ((cancelledCount / totalCases) * 100).toFixed(1) : '0.0';
                const totalLostMargin = cancelledSurgeriesList.reduce((sum, s) => sum + Math.abs(Number(s.margin || 0)), 0);
                const activeCancelledCase = cancelledSurgeriesList.length > 0 ? cancelledSurgeriesList[0] : null;

                // Dynamic waitlist candidates generated from real database CPT codes & surgeons
                const dynamicWaitlist = (cptTableData && cptTableData.length > 0 ? cptTableData.slice(0, 4) : WAITLIST_CASES).map((cpt, index) => {
                  const realDoc = surgeonsList && surgeonsList.length > 0 ? (surgeonsList[index % surgeonsList.length].name || `Dr. ${surgeonsList[index % surgeonsList.length].lastname} ${surgeonsList[index % surgeonsList.length].firstname}`.trim()) : (cpt.surgeon || 'Staff Surgeon');
                  return {
                    id: index + 101,
                    code: cpt.code || 'General',
                    desc: cpt.desc || cpt.label || 'Surgical Procedure',
                    surgeon: realDoc,
                    duration: cpt.time || cpt.duration || 60,
                    rev: Math.round(Number(cpt.fee || cpt.rev || 12000)),
                    supplies: Math.round(Number(cpt.supply || cpt.supplies || 2500)),
                    implants: Math.round(Number(cpt.implants || 0)),
                    margin: Math.round(Number(cpt.margin || 5000))
                  };
                });

                // Calculate reasons breakdown dynamically
                let medCount = 0;
                let insCount = 0;
                let noShowCount = 0;
                let adminCount = 0;
                if (cancelledCount > 0) {
                  cancelledSurgeriesList.forEach(s => {
                    const reasonText = `${s.cancellation_reason || ''} ${s.notes || ''}`.toLowerCase();
                    if (reasonText.includes('insur') || reasonText.includes('auth') || reasonText.includes('payer')) {
                      insCount++;
                    } else if (reasonText.includes('no-show') || reasonText.includes('late') || reasonText.includes('patient') || reasonText.includes('refus')) {
                      noShowCount++;
                    } else if (reasonText.includes('schedul') || reasonText.includes('admin') || reasonText.includes('staff') || reasonText.includes('room')) {
                      adminCount++;
                    } else {
                      medCount++; // Default medical/pre-op clearance issue
                    }
                  });
                }

                const medPct = cancelledCount > 0 ? Math.round((medCount / cancelledCount) * 100) : 0;
                const insPct = cancelledCount > 0 ? Math.round((insCount / cancelledCount) * 100) : 0;
                const noShowPct = cancelledCount > 0 ? Math.round((noShowCount / cancelledCount) * 100) : 0;
                const adminPct = cancelledCount > 0 ? Math.max(0, 100 - medPct - insPct - noShowPct) : 0;

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                      <div className="kpi-card">
                        <span className="kpi-label">Cancellation Rate</span>
                        <span className="kpi-value" style={{ color: cancelledCount > 0 ? 'var(--color-red)' : 'var(--color-green)' }}>{cancelRate}%</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Facility average target &lt; 5.0%</span>
                      </div>
                      <div className="kpi-card">
                        <span className="kpi-label">Lost Contrib. Margin</span>
                        <span className="kpi-value" style={{ color: totalLostMargin > 0 ? 'var(--color-red)' : 'var(--color-green)' }}>${totalLostMargin.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Based on total recorded cancellations</span>
                      </div>
                      <div className="kpi-card">
                        <span className="kpi-label">Cancelled Cases</span>
                        <span className="kpi-value" style={{ color: cancelledCount > 0 ? 'var(--color-red)' : 'var(--text-primary)' }}>{cancelledCount} Cases</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total recorded cancelled cases</span>
                      </div>
                      <div className="kpi-card">
                        <span className="kpi-label">Avg Lead Notification Time</span>
                        <span className="kpi-value">{cancelledCount > 0 ? '4.5 hours' : '0 hours'}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Time before scheduled start</span>
                      </div>
                    </div>

                    {/* Dynamic Real-Time Operational Banner */}
                    <div
                      style={{
                        backgroundColor: activeCancelledCase ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                        border: `1px solid ${activeCancelledCase ? 'var(--color-red)' : 'var(--color-green)'}`,
                        borderRadius: '12px',
                        padding: '16px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '10px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ color: activeCancelledCase ? 'var(--color-red)' : 'var(--color-green)', fontSize: '1.25rem' }}>
                          {activeCancelledCase ? <AlertTriangle /> : <CheckCircle />}
                        </div>
                        <div>
                          <h4 style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                            {activeCancelledCase ? 'Operational Cancellation Anomaly Detected' : 'Optimal Schedule Adherence (Zero Cancellations)'}
                          </h4>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                            {activeCancelledCase
                              ? `CANCELLATION RECORDED: ${activeCancelledCase.or || 'OR Block'} on ${activeCancelledCase.date || 'Today'} (${activeCancelledCase.label || 'Procedure'} — ${activeCancelledCase.doctor}) was cancelled! Estimated Margin Impact: -$${Math.abs(Number(activeCancelledCase.margin || 0)).toLocaleString('en-US')}.`
                              : 'All scheduled surgical cases in the active database filter are proceeding as planned with 0% cancellation revenue leakage. OR blocks are operating at peak efficiency.'}
                          </p>
                        </div>
                      </div>

                      <button
                        className="btn-header btn-primary"
                        onClick={() => setShowAutoSuggest(!showAutoSuggest)}
                      >
                        <Sparkles size={14} style={{ marginRight: '6px' }} />
                        {activeCancelledCase ? 'Run Action Engine' : (showAutoSuggest ? 'Hide Action Engine' : 'Proactive Standby Pool')}
                      </button>
                    </div>

                    {showAutoSuggest && (
                      <div className="dashboard-card" style={{ border: '1px solid var(--color-blue)', boxShadow: '0 0 15px rgba(59, 130, 246, 0.2)', marginBottom: '10px' }}>
                        <div className="card-header">
                          <h3 className="card-title" style={{ color: 'var(--color-blue)' }}><Sparkles size={16} /> Action Engine: {activeCancelledCase ? 'Vacant Slot Replacements' : 'Standby Backfill Candidates'}</h3>
                        </div>
                        <div className="custom-table-container">
                          <table className="custom-table">
                            <thead>
                              <tr>
                                <th>Patient Code</th>
                                <th>CPT / Description</th>
                                <th>Surgeon</th>
                                <th>Duration</th>
                                <th>Revenue</th>
                                <th>Supply Cost</th>
                                <th>Implant Cost</th>
                                <th>Contrib. Margin</th>
                                <th>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dynamicWaitlist.map(wc => (
                                <tr key={wc.id}>
                                  <td style={{ fontWeight: '600' }}>#{wc.id}</td>
                                  <td>
                                    <div style={{ fontWeight: '600' }}>CPT {wc.code}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{wc.desc}</div>
                                  </td>
                                  <td>{wc.surgeon}</td>
                                  <td>{wc.duration} mins</td>
                                  <td>${wc.rev.toLocaleString()}</td>
                                  <td>${wc.supplies.toLocaleString()}</td>
                                  <td>${wc.implants.toLocaleString()}</td>
                                  <td style={{ color: 'var(--color-green)', fontWeight: '700' }}>${wc.margin.toLocaleString()}</td>
                                  <td>
                                    <button
                                      className="btn-header btn-primary"
                                      style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                      onClick={() => handleSimulateResolve(wc)}
                                    >
                                      {activeCancelledCase ? 'Fill Vacant Slot' : 'Reserve Standby'}
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }}>
                      <div className="dashboard-card">
                        <div className="card-header">
                          <h3 className="card-title">Recent Updates &amp; Schedule Log</h3>
                        </div>
                        <div className="custom-table-container">
                          <table className="custom-table">
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Procedure</th>
                                <th>Surgeon</th>
                                <th>Status / Reason</th>
                                <th>Estimated Margin Impact</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredSurgeries
                                .slice(0, 10)
                                .map((c, i) => {
                                  const statusLower = c.status?.toLowerCase() || 'scheduled';
                                  const isCancelled = statusLower === 'cancelled' || statusLower === 'canceled';
                                  const isRescheduled = statusLower === 'rescheduled';
                                  const isCompleted = statusLower === 'completed';

                                  let statusDisplay = 'Scheduled (On Time)';
                                  let statusColor = 'var(--color-blue)';
                                  if (isCancelled) {
                                    statusDisplay = `Cancelled: ${c.cancellation_reason || (c.notes && !c.notes.includes('Facility') ? c.notes.replace(/^Cancelled:\s*/i, '') : 'Medical / Pre-op clearance issue')}`;
                                    statusColor = 'var(--color-red)';
                                  } else if (isRescheduled) {
                                    statusDisplay = `Rescheduled ${c.notes && !c.notes.includes('Facility') ? `(${c.notes})` : ''}`;
                                    statusColor = 'var(--color-orange)';
                                  } else if (isCompleted) {
                                    statusDisplay = 'Completed (Procedure Successful)';
                                    statusColor = 'var(--color-green)';
                                  }

                                  return (
                                    <tr
                                      key={c.id || i}
                                      onClick={() => { setSelectedSurgeon(c.doctor); setProfileTab('schedule'); }}
                                      style={{ cursor: 'pointer' }}
                                      className="clickable-row"
                                    >
                                      <td>{c.date ? new Date(c.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A'}</td>
                                      <td style={{ fontWeight: '600' }}>{c.label}</td>
                                      <td style={{ fontWeight: '600', color: 'var(--color-blue)' }}>{c.doctor}</td>
                                      <td style={{ color: statusColor, fontWeight: '600' }}>
                                        {statusDisplay}
                                      </td>
                                      <td style={{ color: isCancelled ? 'var(--color-red)' : 'var(--color-green)', fontWeight: '600' }}>
                                        {isCancelled ? '-' : '+'}${Math.abs(Number(c.margin || 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                      </td>
                                    </tr>
                                  );
                                })}
                              {filteredSurgeries.length === 0 && (
                                <tr>
                                  <td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
                                    No records found for selected timeframe
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="dashboard-card">
                        <div className="card-header">
                          <h3 className="card-title">Cancellations by Reason</h3>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          {cancelledCount === 0 && (
                            <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--color-green)', padding: '10px 14px', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--color-green)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <CheckCircle size={16} />
                              <span><strong>100% Schedule Adherence:</strong> Zero cancellations recorded in current dataset. Showing facility benchmarks below:</span>
                            </div>
                          )}

                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                            <span>Medical Issues (Pre-Op clearance / elevated vitals)</span>
                            <span style={{ fontWeight: '600' }}>{cancelledCount > 0 ? `${medCount} (${medPct}%)` : 'Facility Baseline: 42%'}</span>
                          </div>
                          <div style={{ height: '6px', width: '100%', backgroundColor: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${cancelledCount > 0 ? medPct : 42}%`, backgroundColor: 'var(--color-red)', opacity: cancelledCount > 0 ? 1 : 0.4 }} />
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                            <span>Insurance / Authorization issues</span>
                            <span style={{ fontWeight: '600' }}>{cancelledCount > 0 ? `${insCount} (${insPct}%)` : 'Facility Baseline: 28%'}</span>
                          </div>
                          <div style={{ height: '6px', width: '100%', backgroundColor: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${cancelledCount > 0 ? insPct : 28}%`, backgroundColor: 'var(--color-red)', opacity: cancelledCount > 0 ? 1 : 0.4 }} />
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                            <span>Patient No-Show / Late cancellation</span>
                            <span style={{ fontWeight: '600' }}>{cancelledCount > 0 ? `${noShowCount} (${noShowPct}%)` : 'Facility Baseline: 20%'}</span>
                          </div>
                          <div style={{ height: '6px', width: '100%', backgroundColor: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${cancelledCount > 0 ? noShowPct : 20}%`, backgroundColor: 'var(--color-orange)', opacity: cancelledCount > 0 ? 1 : 0.4 }} />
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                            <span>Administrative / Scheduling conflict</span>
                            <span style={{ fontWeight: '600' }}>{cancelledCount > 0 ? `${adminCount} (${adminPct}%)` : 'Facility Baseline: 10%'}</span>
                          </div>
                          <div style={{ height: '6px', width: '100%', backgroundColor: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${cancelledCount > 0 ? adminPct : 10}%`, backgroundColor: 'var(--color-grey)', opacity: cancelledCount > 0 ? 1 : 0.4 }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ==========================================
              TAB: REPORTS & ANALYTICS
              ========================================== */}
              {activeTab === 'reports' && (
                <div className="dashboard-card">
                  <div className="card-header">
                    <h3 className="card-title">Reports & Analytics</h3>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Export monthly clinical logs, surgeon score sheets, and billing ledgers.
                  </p>
                </div>
              )}

              {/* ==========================================
              TAB: DATA EXPLORER
              ========================================== */}
              {activeTab === 'data' && (
                <div className="dashboard-card">
                  <div className="card-header">
                    <h3 className="card-title">Ad-hoc Data Explorer</h3>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Query facility databases and build customized tabular grids.
                  </p>
                </div>
              )}

              {/* ==========================================
              TAB: USER PROFILE & CREDENTIALS
              ========================================== */}
              {activeTab === 'profile' && (
                <UserProfile
                  user={authUser}
                  onUpdateUser={(updated) => setAuthUser(updated)}
                  onBack={() => setActiveTab('dashboard')}
                  onLogout={handleLogout}
                />
              )}

              {/* ==========================================
              TAB: SETTINGS
              ========================================== */}
              {activeTab === 'settings' && (
                <SettingsView />
              )}

              {/* ==========================================
              TAB: USER MANAGEMENT (RBAC)
              ========================================== */}
              {activeTab === 'user_management' && (
                <RoleGate
                  allowedRoles={['super_admin', 'org_admin', 'facility_admin']}
                  requiredPermission="users.view"
                  fallback={
                    <div style={{ padding: '48px', textAlign: 'center', backgroundColor: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', margin: '24px' }}>
                      <Shield size={48} style={{ color: '#ef4444', marginBottom: '16px' }} />
                      <h3 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', color: 'var(--text-primary)' }}>Administrative Access Required</h3>
                      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        You do not possess the required <code>users.view</code> permission or executive role tier to administer user memberships.
                      </p>
                    </div>
                  }
                >
                  <UserManagement activeFacility={activeFacility} theme={theme} />
                </RoleGate>
              )}

              {/* ==========================================
              TAB: ROLES & PERMISSIONS ARCHITECTURE (RBAC)
              ========================================== */}
              {activeTab === 'role_management' && (
                <RoleGate
                  allowedRoles={['super_admin', 'org_admin', 'facility_admin']}
                  requiredPermission="roles.view"
                  fallback={
                    <div style={{ padding: '48px', textAlign: 'center', backgroundColor: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', margin: '24px' }}>
                      <Shield size={48} style={{ color: '#ef4444', marginBottom: '16px' }} />
                      <h3 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', color: 'var(--text-primary)' }}>Administrative Access Required</h3>
                      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        You do not possess the required <code>roles.view</code> permission or executive role tier to configure security access roles.
                      </p>
                    </div>
                  }
                >
                  <RoleManagement activeFacility={activeFacility} theme={theme} />
                </RoleGate>
              )}

              {/* ==========================================
              TAB: AUDIT LOGS & PROVENANCE (PHASE 24)
              ========================================== */}
              {activeTab === 'audit_logs' && (
                <RoleGate
                  allowedRoles={['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director', 'cfo', 'biller']}
                  requiredPermission="audit.view_clinical"
                  fallback={
                    <div style={{ padding: '48px', textAlign: 'center', backgroundColor: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', margin: '24px' }}>
                      <Shield size={48} style={{ color: '#ef4444', marginBottom: '16px' }} />
                      <h3 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', color: 'var(--text-primary)' }}>Compliance Audit Access Required</h3>
                      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        You do not possess the required <code>audit.view_clinical</code> or <code>audit.view_financial</code> permission to inspect immutable compliance logs.
                      </p>
                    </div>
                  }
                >
                  <AuditLogViewer activeFacility={activeFacility} theme={theme} />
                </RoleGate>
              )}

              {/* ==========================================
              TAB: INSTRUCTION PANEL
              ========================================== */}
              {activeTab === 'instruction' && (
                <InstructionPanel />
              )}

              {/* ==========================================
              TAB: AI AGENT
              ========================================== */}
              {activeTab === 'ai_agent' && (
                <AIOperationsAnalyst 
                  surgeries={filteredSurgeries} 
                  cptCodes={cptCodesList} 
                  patients={patients}
                  settings={{}} 
                  onSchedule={async (surgData) => {
                      const newSurg = await db.addSurgery(surgData);
                      if (newSurg) {
                        setSurgeries(prev => [{ ...surgData, id: newSurg.id, status: newSurg.status || 'scheduled' }, ...prev]);
                      }
                  }}
                />
              )}


              {/* ==========================================
              TAB: HELP & SUPPORT
              ========================================== */}
              {activeTab === 'help' && (
                <div className="dashboard-card">
                  <div className="card-header">
                    <h3 className="card-title">Help & Support Desk</h3>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Access operational manuals and contact support engineers.
                  </p>
                </div>
              )}

              {/* ==========================================
              TAB: SURGERY LOG & OR SCHEDULE
              ========================================== */}
              {activeTab === 'scheduler' && (
                <SurgeryScheduler
                  patients={patients}
                  surgeons={surgeonsList}
                  cptCodes={cptCodesList}
                  surgeries={filteredSurgeries}
                  onSchedule={async (surgData) => {
                    const newSurg = await db.addSurgery(surgData);
                    if (newSurg) {
                      setSurgeries(prev => [{ ...surgData, id: newSurg.id, status: newSurg.status || 'scheduled' }, ...prev]);
                    }
                  }}
                  onUpdate={async (id, updates) => {
                    await db.updateSurgery(id, updates);
                    setSurgeries(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
                  }}
                  onDelete={async (id) => {
                    await db.deleteSurgery(id);
                    setSurgeries(prev => prev.filter(s => s.id !== id));
                  }}
                />
              )}

              {/* ==========================================
              TAB: CPT CODES MANAGEMENT
              ========================================== */}
              {activeTab === 'cpt_manage' && (
                <CPTManagement
                  cptCodes={cptCodesList}
                  surgeries={filteredSurgeries}
                  onAdd={handleAddCPT}
                  onUpdate={handleUpdateCPT}
                  onDelete={handleDeleteCPT}
                />
              )}

              {/* ==========================================
              TAB: UPLOAD CODE FILES
              ========================================== */}
              {activeTab === 'upload_code_files' && (
                <CPTUpload />
              )}

              {/* ==========================================
              TAB: OT COST MANAGEMENT
              ========================================== */}
              {activeTab === 'ot_cost_manage' && (
                <OTCostManagement />
              )}

              {/* ==========================================
              TAB: AI OPS ANALYST
              ========================================== */}
              {activeTab === 'ai_ops_analyst' && (
                <AIOperationsAnalyst
                  surgeries={filteredSurgeries}
                  cptCodes={cptCodesList}
                  patients={patients}
                  onSchedule={async (surgData) => {
                      const newSurg = await db.addSurgery(surgData);
                      if (newSurg) {
                        setSurgeries(prev => [{ ...surgData, id: newSurg.id, status: newSurg.status || 'scheduled' }, ...prev]);
                      }
                  }}
                />
              )}
            </>
          )}
        </section>
      </main>

      {/* ==========================================
          MODAL: CASE DETAILS (CONTRIBUTION MARGIN DETAILS)
          ========================================== */}
      {selectedCase && (
        <div className="modal-overlay" onClick={() => setSelectedCase(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: '700' }}>
                Case Contribution Margin Analysis
              </h3>
              <button className="modal-close" onClick={() => setSelectedCase(null)}>×</button>
            </div>

            <div className="modal-body">
              <div style={{ marginBottom: '10px' }}>
                <h4 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)' }}>{selectedCase.label}</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                  CPT Code: {selectedCase.code} | Surgeon: {selectedCase.doctor} | Room: {selectedCase.or}
                </p>
              </div>

              <div className="cost-row">
                <span>Total Facility Revenue</span>
                <span style={{ fontWeight: '600' }}>${selectedCase.revenue.toLocaleString()}</span>
              </div>

              <div className="cost-row">
                <span>Supply Costs (preference card)</span>
                <span style={{ color: 'var(--color-red)' }}>-${selectedCase.supplies.toLocaleString()}</span>
              </div>

              <div className="cost-row">
                <span>Implant Costs</span>
                <span style={{ color: 'var(--color-red)' }}>-${selectedCase.implants.toLocaleString()}</span>
              </div>

              <div className="cost-row">
                <span>OR Labor Costs (staff)</span>
                <span style={{ color: 'var(--color-red)' }}>-${selectedCase.labor.toLocaleString()}</span>
              </div>

              <div className="cost-row" style={{ borderBottom: '1px solid var(--border-color)' }}>
                <span>OR Room Fixed Cost allocation</span>
                <span style={{ color: 'var(--color-red)' }}>-${selectedCase.roomCost.toLocaleString()}</span>
              </div>

              <div className="cost-row total">
                <span>Contribution Margin</span>
                <span style={{ color: 'var(--color-green)' }}>
                  +${selectedCase.margin.toLocaleString()} ({Math.round((selectedCase.margin / selectedCase.revenue) * 100)}%)
                </span>
              </div>

              <div style={{ backgroundColor: 'rgba(59,130,246,0.05)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '10px', marginTop: '10px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>Decision Engine Insight:</span> This case contributes <strong>${Math.round(selectedCase.margin / ((selectedCase.endMin - selectedCase.startMin) / 60)).toLocaleString()} / OR Hour</strong>. Implants represent the highest cost driver at {Math.round((selectedCase.implants / selectedCase.revenue) * 100)}% of total revenue.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: ADD / EDIT PATIENT
          ========================================== */}
      {patientModalOpen && (
        <div className="modal-overlay" onClick={() => setPatientModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '600px', maxWidth: '95%' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={18} style={{ color: 'var(--color-blue)' }} />
                {editingPatient ? 'Edit Patient Record' : 'Add New Patient Record'}
              </h3>
              <button className="modal-close" onClick={() => setPatientModalOpen(false)}>×</button>
            </div>

            <form onSubmit={handleSavePatient} className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: '6px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Basic Information Section */}
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--color-blue)', marginBottom: '12px', paddingBottom: '6px', borderBottom: '1px solid var(--border-light)' }}>
                  Basic Information
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. DOE, JOHN"
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px' }}
                      value={patientForm.name}
                      onChange={(e) => setPatientForm({ ...patientForm, name: e.target.value.toUpperCase() })}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Date of Birth *</label>
                    <input
                      type="date"
                      required
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px' }}
                      value={patientForm.dob}
                      onChange={(e) => setPatientForm({ ...patientForm, dob: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>MRN Number *</label>
                    <input
                      type="text"
                      required
                      placeholder="Medical Record Number"
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px' }}
                      value={patientForm.mrn}
                      onChange={(e) => setPatientForm({ ...patientForm, mrn: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Phone *</label>
                    <input
                      type="tel"
                      required
                      placeholder="10-digit number"
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px' }}
                      value={patientForm.phone}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                        setPatientForm({ ...patientForm, phone: val });
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: 'span 2' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Gender *</label>
                    <select
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px', background: 'var(--bg-card)' }}
                      value={patientForm.gender}
                      onChange={(e) => setPatientForm({ ...patientForm, gender: e.target.value })}
                      required
                    >
                      <option value="">Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Non-Binary">Non-Binary</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Contact Information Section */}
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--color-blue)', marginBottom: '12px', paddingBottom: '6px', borderBottom: '1px solid var(--border-light)' }}>
                  Contact Information
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Email Address *</label>
                    <input
                      type="email"
                      required
                      placeholder="patient@example.com"
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px' }}
                      value={patientForm.email}
                      onChange={(e) => setPatientForm({ ...patientForm, email: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Address *</label>
                    <input
                      type="text"
                      required
                      placeholder="123 Main St, City, State ZIP"
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px' }}
                      value={patientForm.address}
                      onChange={(e) => setPatientForm({ ...patientForm, address: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Primary Insurance Section */}
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--color-blue)', marginBottom: '12px', paddingBottom: '6px', borderBottom: '1px solid var(--border-light)' }}>
                  Primary Insurance Information
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Insurance Provider *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Blue Cross"
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px' }}
                      value={patientForm.insurance_provider}
                      onChange={(e) => setPatientForm({ ...patientForm, insurance_provider: e.target.value })}
                      list="insurance-providers"
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Policy Number *</label>
                    <input
                      type="text"
                      required
                      placeholder="Policy/Member ID"
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px' }}
                      value={patientForm.insurance_policy_number}
                      onChange={(e) => setPatientForm({ ...patientForm, insurance_policy_number: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Group Number</label>
                    <input
                      type="text"
                      placeholder="Group ID"
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px' }}
                      value={patientForm.insurance_group_number}
                      onChange={(e) => setPatientForm({ ...patientForm, insurance_group_number: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Insurance Type *</label>
                    <select
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px', background: 'var(--bg-card)' }}
                      value={patientForm.insurance_type}
                      onChange={(e) => setPatientForm({ ...patientForm, insurance_type: e.target.value })}
                      required
                    >
                      <option value="Primary">Primary</option>
                      <option value="Secondary">Secondary</option>
                      <option value="Medicare">Medicare</option>
                      <option value="Medicaid">Medicaid</option>
                      <option value="Private">Private</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Subscriber Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="Policy holder name"
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px' }}
                      value={patientForm.subscriber_name}
                      onChange={(e) => setPatientForm({ ...patientForm, subscriber_name: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Relationship to Subscriber *</label>
                    <select
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px', background: 'var(--bg-card)' }}
                      value={patientForm.subscriber_relationship}
                      onChange={(e) => setPatientForm({ ...patientForm, subscriber_relationship: e.target.value })}
                      required
                    >
                      <option value="Self">Self</option>
                      <option value="Spouse">Spouse</option>
                      <option value="Child">Child</option>
                      <option value="Parent">Parent</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Effective Date *</label>
                    <input
                      type="date"
                      required
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px' }}
                      value={patientForm.insurance_effective_date}
                      onChange={(e) => setPatientForm({ ...patientForm, insurance_effective_date: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Expiration Date *</label>
                    <input
                      type="date"
                      required
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px' }}
                      value={patientForm.insurance_expiration_date}
                      onChange={(e) => setPatientForm({ ...patientForm, insurance_expiration_date: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Copay Amount</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px' }}
                      value={patientForm.copay_amount}
                      onChange={(e) => setPatientForm({ ...patientForm, copay_amount: e.target.value })}
                      step="0.01"
                      min="0"
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Deductible Amount</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px' }}
                      value={patientForm.deductible_amount}
                      onChange={(e) => setPatientForm({ ...patientForm, deductible_amount: e.target.value })}
                      step="0.01"
                      min="0"
                    />
                  </div>
                </div>
              </div>

              {/* Secondary Insurance Section */}
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--color-blue)', marginBottom: '12px', paddingBottom: '6px', borderBottom: '1px solid var(--border-light)' }}>
                  Secondary Insurance (Optional)
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Secondary Provider</label>
                    <input
                      type="text"
                      placeholder="e.g. Aetna"
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px' }}
                      value={patientForm.secondary_insurance_provider}
                      onChange={(e) => setPatientForm({ ...patientForm, secondary_insurance_provider: e.target.value })}
                      list="insurance-providers"
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Secondary Policy Number</label>
                    <input
                      type="text"
                      placeholder="Secondary ID"
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px' }}
                      value={patientForm.secondary_insurance_policy_number}
                      onChange={(e) => setPatientForm({ ...patientForm, secondary_insurance_policy_number: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: 'span 2' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Secondary Group Number</label>
                    <input
                      type="text"
                      placeholder="Secondary Group ID"
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px' }}
                      value={patientForm.secondary_insurance_group_number}
                      onChange={(e) => setPatientForm({ ...patientForm, secondary_insurance_group_number: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Insurance Providers Datalist */}
              <datalist id="insurance-providers">
                <option value="UnitedHealthcare" />
                <option value="Cigna Healthcare" />
                <option value="Aetna" />
                <option value="Blue Cross Blue Shield" />
                <option value="Humana" />
                <option value="Medicare" />
                <option value="Medicaid" />
                <option value="Kaiser Permanente" />
                <option value="Anthem" />
                <option value="Tricare" />
              </datalist>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
                <button
                  type="button"
                  className="btn-header"
                  onClick={() => setPatientModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-header btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <CheckCircle size={14} /> Save Patient
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: ADD / EDIT SURGEON
          ========================================== */}
      {surgeonModalOpen && (
        <div className="modal-overlay" onClick={() => setSurgeonModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '750px', maxWidth: '95%' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserCheck size={18} style={{ color: 'var(--color-blue)' }} />
                {editingSurgeon ? 'Edit Surgeon Profile' : 'Register New Surgeon'}
              </h3>
              <button className="modal-close" onClick={() => setSurgeonModalOpen(false)}>×</button>
            </div>

            <form onSubmit={handleSaveSurgeon} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Personal Information */}
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--color-blue)', marginBottom: '12px', paddingBottom: '6px', borderBottom: '1px solid var(--border-light)' }}>
                  Personal Details
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>First Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. John"
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px' }}
                      value={surgeonForm.firstname}
                      onChange={(e) => setSurgeonForm({ ...surgeonForm, firstname: e.target.value })}
                      maxLength={20}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Last Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Doe"
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px' }}
                      value={surgeonForm.lastname}
                      onChange={(e) => setSurgeonForm({ ...surgeonForm, lastname: e.target.value })}
                      maxLength={20}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Specialty *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. General Surgery"
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px' }}
                      value={surgeonForm.specialty}
                      onChange={(e) => setSurgeonForm({ ...surgeonForm, specialty: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>License / NPI *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. MD-99001"
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px' }}
                      value={surgeonForm.license_number}
                      onChange={(e) => setSurgeonForm({ ...surgeonForm, license_number: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--color-blue)', marginBottom: '12px', paddingBottom: '6px', borderBottom: '1px solid var(--border-light)' }}>
                  Contact & Credentials
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Phone *</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select
                        className="date-range-selector"
                        style={{ width: '85px', height: '36px', background: 'var(--bg-card)', padding: '2px 8px' }}
                        value={surgeonForm.countryCode}
                        onChange={(e) => setSurgeonForm({ ...surgeonForm, countryCode: e.target.value })}
                      >
                        <option value="+1">+1 (US)</option>
                        <option value="+44">+44 (UK)</option>
                        <option value="+91">+91 (IN)</option>
                        <option value="+61">+61 (AU)</option>
                        <option value="+81">+81 (JP)</option>
                        <option value="+49">+49 (DE)</option>
                        <option value="+33">+33 (FR)</option>
                      </select>
                      <input
                        type="tel"
                        required
                        placeholder="10 digit number"
                        className="date-range-selector"
                        style={{ flex: 1, height: '36px' }}
                        value={surgeonForm.phone}
                        onChange={(e) => setSurgeonForm({ ...surgeonForm, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Email *</label>
                    <input
                      type="email"
                      required
                      placeholder="surgeon@hospital.com"
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px' }}
                      value={surgeonForm.email}
                      onChange={(e) => setSurgeonForm({ ...surgeonForm, email: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: 'span 2' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Password *</label>
                    <input
                      type="password"
                      required
                      placeholder="Set surgeon login password"
                      className="date-range-selector"
                      style={{ width: '100%', height: '36px' }}
                      value={surgeonForm.password}
                      onChange={(e) => setSurgeonForm({ ...surgeonForm, password: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Block Schedule Templates */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '6px', borderBottom: '1px solid var(--border-light)' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--color-blue)', margin: 0 }}>
                    Recurring Block Schedule
                  </h4>
                  <button
                    type="button"
                    className="btn-header"
                    style={{ padding: '2px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', borderColor: 'var(--color-blue)', color: 'var(--color-blue)' }}
                    onClick={() => {
                      setSurgeonForm({
                        ...surgeonForm,
                        block_templates: [...(surgeonForm.block_templates || []), { week: 'First', day: 'Monday', room: 'OR 1', startTime: '07:30', endTime: '16:00' }]
                      });
                    }}
                  >
                    + Add Block
                  </button>
                </div>

                {(!surgeonForm.block_templates || surgeonForm.block_templates.length === 0) ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>
                    No recurring block schedules assigned.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {surgeonForm.block_templates.map((block, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-lighter)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                        <select
                          className="date-range-selector"
                          style={{ height: '32px', fontSize: '0.8rem', padding: '0 4px' }}
                          value={block.week}
                          onChange={(e) => {
                            const newBlocks = [...surgeonForm.block_templates];
                            newBlocks[idx].week = e.target.value;
                            if (e.target.value === 'Specific Date') {
                              newBlocks[idx].day = new Date().toISOString().split('T')[0];
                            } else if (block.week === 'Specific Date') {
                              newBlocks[idx].day = 'Monday';
                            }
                            setSurgeonForm({ ...surgeonForm, block_templates: newBlocks });
                          }}
                        >
                          <option value="First">First</option>
                          <option value="Second">Second</option>
                          <option value="Third">Third</option>
                          <option value="Fourth">Fourth</option>
                          <option value="Fifth">Fifth</option>
                          <option value="Specific Date">Specific Date</option>
                        </select>

                        {block.week === 'Specific Date' ? (
                          <input
                            type="date"
                            className="date-range-selector"
                            style={{ height: '32px', fontSize: '0.8rem', padding: '0 4px' }}
                            value={block.day}
                            onChange={(e) => {
                              const newBlocks = [...surgeonForm.block_templates];
                              newBlocks[idx].day = e.target.value;
                              setSurgeonForm({ ...surgeonForm, block_templates: newBlocks });
                            }}
                          />
                        ) : (
                          <select
                            className="date-range-selector"
                            style={{ height: '32px', fontSize: '0.8rem', padding: '0 4px' }}
                            value={block.day}
                            onChange={(e) => {
                              const newBlocks = [...surgeonForm.block_templates];
                              newBlocks[idx].day = e.target.value;
                              setSurgeonForm({ ...surgeonForm, block_templates: newBlocks });
                            }}
                          >
                            <option value="Monday">Monday</option>
                            <option value="Tuesday">Tuesday</option>
                            <option value="Wednesday">Wednesday</option>
                            <option value="Thursday">Thursday</option>
                            <option value="Friday">Friday</option>
                          </select>
                        )}

                        <select
                          className="date-range-selector"
                          style={{ height: '32px', fontSize: '0.8rem', padding: '0 4px', flex: 1 }}
                          value={block.room}
                          onChange={(e) => {
                            const newBlocks = [...surgeonForm.block_templates];
                            newBlocks[idx].room = e.target.value;
                            setSurgeonForm({ ...surgeonForm, block_templates: newBlocks });
                          }}
                        >
                          <option value="OR 1">OR 1</option>
                          <option value="OR 2">OR 2</option>
                          <option value="Procedure Room">Procedure Room</option>
                        </select>

                        <input
                          type="time"
                          className="date-range-selector"
                          style={{ height: '32px', fontSize: '0.8rem', padding: '0 4px', width: '90px' }}
                          value={block.startTime}
                          onChange={(e) => {
                            const newBlocks = [...surgeonForm.block_templates];
                            newBlocks[idx].startTime = e.target.value;
                            setSurgeonForm({ ...surgeonForm, block_templates: newBlocks });
                          }}
                        />
                        <span style={{ color: 'var(--text-secondary)' }}>-</span>
                        <input
                          type="time"
                          className="date-range-selector"
                          style={{ height: '32px', fontSize: '0.8rem', padding: '0 4px', width: '90px' }}
                          value={block.endTime}
                          onChange={(e) => {
                            const newBlocks = [...surgeonForm.block_templates];
                            newBlocks[idx].endTime = e.target.value;
                            setSurgeonForm({ ...surgeonForm, block_templates: newBlocks });
                          }}
                        />

                        <button
                          type="button"
                          style={{ background: 'none', border: 'none', color: 'var(--color-red)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                          onClick={() => {
                            const newBlocks = surgeonForm.block_templates.filter((_, i) => i !== idx);
                            setSurgeonForm({ ...surgeonForm, block_templates: newBlocks });
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
                <button
                  type="button"
                  className="btn-header"
                  onClick={() => setSurgeonModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-header btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <CheckCircle size={14} /> Save Surgeon
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: ASC ANALYST — SMART SCHEDULE OPTIMIZATION
          ========================================== */}
      <AIAnalystModal
        isOpen={showAscAnalyst}
        onClose={() => setShowAscAnalyst(false)}
        surgeries={surgeries}
        cptCodes={cptCodesList}
        settings={{}}
      />

      <Chatbot />

      {/* Phase 25: Clinical Inactivity Timeout Modal (HIPAA § 164.312(a)(2)(iii)) */}
      {showInactivityWarning && (
        <div className="inactivity-modal-overlay">
          <div className="inactivity-modal-card">
            <div className="inactivity-modal-header">
              <ShieldAlert size={28} color="#f59e0b" />
              <h3>Session Inactivity Warning</h3>
            </div>
            <p>
              In compliance with HIPAA Security Standards (45 CFR § 164.312), your clinical session will automatically lock in:
            </p>
            <div className="inactivity-countdown">
              {inactivitySeconds}s
            </div>
            <p className="inactivity-subtext">
              To protect Protected Health Information (PHI), unattended sessions are automatically terminated after 15 minutes of inactivity. Click below to continue working.
            </p>
            <div className="inactivity-actions">
              <button
                type="button"
                className="btn-stay-logged-in"
                onClick={resetInactivityTimer}
              >
                Stay Logged In
              </button>
              <button
                type="button"
                className="btn-logout-now"
                onClick={handleSessionTimeout}
              >
                Log Out Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
