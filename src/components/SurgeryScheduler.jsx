import React, { useState, useEffect, useMemo } from 'react';
import Swal from 'sweetalert2';
import { db } from '../lib/supabase';
import jsPDF from 'jspdf';
import {
    Search, Edit, Trash2, Clock,
    DollarSign, AlertCircle, Check, ChevronDown, ChevronUp, Wand2, MessageSquare
} from 'lucide-react';
import ORBlockSchedule from './ORBlockSchedule';
import './SurgeryScheduler.css';

// Format currency helper
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
};

// Round up helper for time display
const formatTimeForInput = (time) => {
    if (!time) return '';
    const t = String(time);
    if (t.includes(':')) {
        const parts = t.split(':');
        return parts[0].padStart(2, '0') + ':' + parts[1].padStart(2, '0');
    }
    return t;
};

// Cosmetic fee calculator based on duration
const calculateCosmeticFees = (durationMinutes) => {
    const facilityRates = {
        30: 750, 60: 1500, 90: 1800, 120: 2100, 150: 2500,
        180: 2900, 210: 3300, 240: 3700, 270: 4100, 300: 4500,
        330: 4900, 360: 5300, 390: 5700, 420: 6100, 480: 6500, 540: 6900
    };
    const anesthesiaRates = {
        30: 600, 60: 750, 90: 900, 120: 1050, 150: 1200,
        180: 1350, 210: 1500, 240: 1650, 270: 1800, 300: 1950,
        330: 2100, 360: 2250, 390: 2400, 420: 2550, 480: 2700, 540: 2850
    };
    const lookupDuration = Math.ceil(durationMinutes / 30) * 30;
    return {
        facilityFee: facilityRates[lookupDuration] || 0,
        anesthesiaFee: anesthesiaRates[lookupDuration] || 0
    };
};

const SurgeryScheduler = ({ patients = [], surgeons = [], cptCodes = [], surgeries = [], onSchedule, onUpdate, onDelete }) => {
    // ----- State -----------------------------------------------------------
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [showSchedule, setShowSchedule] = useState(false);
    const [editingSurgery, setEditingSurgery] = useState(null);
    const [expandedMonths, setExpandedMonths] = useState(new Set());
    const [monthPages, setMonthPages] = useState({});
    const [cptSearchQuery, setCptSearchQuery] = useState('');
    const [selectedBodyPart, setSelectedBodyPart] = useState('');
    const [includeLaborSupplies, setIncludeLaborSupplies] = useState(false);
    const [monthSearchQueries, setMonthSearchQueries] = useState({});
    const [monthSurgeriesPerPage, setMonthSurgeriesPerPage] = useState({});
    const [otExtraCosts, setOtExtraCosts] = useState([]);
    const [orBlocks, setOrBlocks] = useState([]);
    const [staffList, setStaffList] = useState([]);

    useEffect(() => {
        db.getOTExtraCosts().then(setOtExtraCosts).catch(console.error);
        db.getORBlockSchedule().then(setOrBlocks).catch(console.error);
        db.getStaff().then(setStaffList).catch(console.error);
    }, []);

    const [formData, setFormData] = useState({
        patientId: '',
        doctorName: '',
        date: new Date().toISOString().split('T')[0],
        startTime: '',
        durationMinutes: 60,
        turnoverTime: 20,
        selectedCptCodes: [],
        trayCost: 0,
        suppliesCost: 0,
        implantsCost: 0,
        medicationsCost: 0,
        labourCost: 0,
        orRoomCost: 0,
        actualStartTime: '',
        actualEndTime: '',
        actualDurationMinutes: 0,
        writeOff: 0,
        isProbono: false,
        orRoom: 'OR 1',
        cptExpenses: {},
        applyFixedCosmeticFee: false,
        cosmeticFacilityFee: calculateCosmeticFees(60).facilityFee,
        cosmeticAnesthesiaFee: calculateCosmeticFees(60).anesthesiaFee,
        orStaffIds: [],
        calculateStaffFee: false
    });

    const targetDate = formData?.date;
    const availableSurgeons = useMemo(() => {
        if (!targetDate || !surgeons || surgeons.length === 0) return surgeons;
        const [yearStr, monthStr, dayStr] = targetDate.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);
        const day = parseInt(dayStr, 10);

        return surgeons.filter(surgeon => {
            const format1 = `${surgeon.firstname} ${surgeon.lastname}`.trim(); // e.g. "Kelly Malinoski"
            const format2 = surgeon.name || `Dr. ${surgeon.lastname} ${surgeon.firstname}`.trim(); // e.g. "Dr. Malinoski Kelly"

            // Check explicit DB blocks
            if (orBlocks.some(b => b.date === targetDate && (b.provider_name === format1 || b.provider_name === format2))) {
                return true;
            }

            // Check recurring templates
            let templates = surgeon.block_templates;
            if (typeof templates === 'string') {
                try { templates = JSON.parse(templates); } catch { templates = []; }
            }

            if (Array.isArray(templates) && templates.length > 0) {
                const dayNameToIndex = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };
                const weekToMultiplier = { 'First': 0, 'Second': 1, 'Third': 2, 'Fourth': 3, 'Fifth': 4 };

                return templates.some(template => {
                    if (template.week === 'Specific Date') {
                        return template.day === targetDate;
                    } else {
                        const targetDay = dayNameToIndex[template.day];
                        if (targetDay !== undefined) {
                            const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
                            let offset = targetDay - firstDayOfMonth;
                            if (offset < 0) offset += 7;
                            const dayOfMonth = 1 + offset + (weekToMultiplier[template.week] * 7);
                            if (dayOfMonth === day) return true;
                        }
                    }
                    return false;
                });
            }
            return false;
        });
    }, [targetDate, surgeons, orBlocks]);

    // Pagination state used above

    useEffect(() => {
        if (formData.durationMinutes > 0) {
            const fees = calculateCosmeticFees(formData.durationMinutes);
            const timer = setTimeout(() => {
                setFormData(prev => {
                    if (prev.cosmeticFacilityFee === fees.facilityFee && prev.cosmeticAnesthesiaFee === fees.anesthesiaFee) {
                        return prev;
                    }
                    return {
                        ...prev,
                        cosmeticFacilityFee: fees.facilityFee,
                        cosmeticAnesthesiaFee: fees.anesthesiaFee
                    };
                });
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [formData.durationMinutes]);

    // ----- Reset Form -----
    const handleCancelEdit = () => {
        setEditingSurgery(null);
        setIsFormOpen(false);
        setFormData({
            patientId: '',
            doctorName: '',
            date: new Date().toISOString().split('T')[0],
            startTime: '',
            durationMinutes: 60,
            turnoverTime: 20,
            selectedCptCodes: [],
            trayCost: 0,
            suppliesCost: 0,
            implantsCost: 0,
            medicationsCost: 0,
            labourCost: 0,
            orRoomCost: 0,
            actualStartTime: '',
            actualEndTime: '',
            actualDurationMinutes: 0,
            writeOff: 0,
            isProbono: false,
            orRoom: 'OR 1',
            cptExpenses: {},
            applyFixedCosmeticFee: false,
            cosmeticFacilityFee: calculateCosmeticFees(60).facilityFee,
            cosmeticAnesthesiaFee: calculateCosmeticFees(60).anesthesiaFee,
            orStaffIds: [],
            calculateStaffFee: false
        });
    };

    const selectedSurgeon = useMemo(() => {
        return surgeons.find(s => s.name === formData.doctorName || `${s.lastname} ${s.firstname}`.trim() === formData.doctorName.replace(/^Dr\.\s*/i, '').trim());
    }, [surgeons, formData.doctorName]);

    const isCosmeticSurgeon = selectedSurgeon?.is_cosmetic_surgeon ||
        selectedSurgeon?.specialty?.toLowerCase().includes('plastic') ||
        selectedSurgeon?.specialty?.toLowerCase().includes('cosmetic');

    const toggleForm = () => {
        if (isFormOpen) {
            handleCancelEdit();
        } else {
            setIsFormOpen(true);
        }
    };

    // ----- Edit Surgery -----
    const handleEdit = (surgery) => {
        setEditingSurgery(surgery);

        // Fetch tray_cost with notes fallback
        let trayCostVal = parseFloat(surgery.tray_cost || 0);
        if (trayCostVal === 0 && surgery.notes) {
            const match = surgery.notes.match(/\[Tray Cost:\s*([\d.]+)\]/);
            if (match) {
                trayCostVal = parseFloat(match[1]);
            }
        }

        // Parse CPT codes array
        let selectedCpts = [];
        if (Array.isArray(surgery.cpt_codes)) {
            selectedCpts = surgery.cpt_codes.map(String);
        } else if (typeof surgery.cpt_codes === 'string') {
            try {
                const parsed = JSON.parse(surgery.cpt_codes);
                if (Array.isArray(parsed)) {
                    selectedCpts = parsed.map(String);
                } else {
                    selectedCpts = [String(parsed)];
                }
            } catch {
                selectedCpts = surgery.cpt_codes.split(',').map(s => s.trim()).filter(Boolean);
            }
        }

        let calcCptExpenses = {};
        let calcSupplies = 0;
        let calcImplants = 0;
        let calcMeds = 0;
        let calcTray = 0;
        let calcLabour = 0;
        let calcOrRoom = 0;

        if (surgery.cpt_expenses && typeof surgery.cpt_expenses === 'object' && Object.keys(surgery.cpt_expenses).length > 0) {
            calcCptExpenses = JSON.parse(JSON.stringify(surgery.cpt_expenses));

            selectedCpts.forEach(code => {
                const exp = calcCptExpenses[code];
                if (exp && typeof exp === 'object') {
                    calcSupplies += parseFloat(exp.suppliesCost || 0);
                    calcImplants += parseFloat(exp.implantsCost || 0);
                    calcMeds += parseFloat(exp.medicationsCost || 0);
                    calcTray += parseFloat(exp.trayCost || 0);
                    calcLabour += parseFloat(exp.labourCost || 0);
                    calcOrRoom += parseFloat(exp.orRoomCost || 0);
                }
            });
        } else {
            selectedCpts.forEach(code => {
                const extraCostData = otExtraCosts.find(c => String(c.cpt_codes) === String(code));

                const exp = {
                    suppliesCost: parseFloat(extraCostData?.supply_cost || 0),
                    implantsCost: parseFloat(extraCostData?.implant_cost || 0),
                    medicationsCost: parseFloat(extraCostData?.medication_cost || 0),
                    trayCost: parseFloat(extraCostData?.tray_cost || 0),
                    labourCost: parseFloat(extraCostData?.labour_cost || 0),
                    orRoomCost: parseFloat(extraCostData?.or_room_cost || 0)
                };
                calcCptExpenses[code] = exp;

                calcSupplies += exp.suppliesCost;
                calcImplants += exp.implantsCost;
                calcMeds += exp.medicationsCost;
                calcTray += exp.trayCost;
                calcLabour += exp.labourCost;
                calcOrRoom += exp.orRoomCost;
            });
        }

        // Distribute any discrepancy (e.g. from past custom edits) to the first selected CPT
        if (selectedCpts.length > 0) {
            const first = selectedCpts[0];
            const dbSupplies = parseFloat(surgery.supplies_cost || calcSupplies || 0);
            const dbImplants = parseFloat(surgery.implants_cost || calcImplants || 0);
            const dbMeds = parseFloat(surgery.medications_cost || calcMeds || 0);
            const dbTray = parseFloat(trayCostVal || calcTray || 0);
            const dbLabour = parseFloat(surgery.actual_labor_cost || calcLabour || 0);
            const dbOrRoom = parseFloat(surgery.actual_room_cost || calcOrRoom || 0);

            if (calcSupplies !== dbSupplies) calcCptExpenses[first].suppliesCost = Math.max(0, calcCptExpenses[first].suppliesCost + (dbSupplies - calcSupplies));
            if (calcImplants !== dbImplants) calcCptExpenses[first].implantsCost = Math.max(0, calcCptExpenses[first].implantsCost + (dbImplants - calcImplants));
            if (calcMeds !== dbMeds) calcCptExpenses[first].medicationsCost = Math.max(0, calcCptExpenses[first].medicationsCost + (dbMeds - calcMeds));
            if (calcTray !== dbTray) calcCptExpenses[first].trayCost = Math.max(0, calcCptExpenses[first].trayCost + (dbTray - calcTray));
            if (calcLabour !== dbLabour) calcCptExpenses[first].labourCost = Math.max(0, calcCptExpenses[first].labourCost + (dbLabour - calcLabour));
            if (calcOrRoom !== dbOrRoom) calcCptExpenses[first].orRoomCost = Math.max(0, calcCptExpenses[first].orRoomCost + (dbOrRoom - calcOrRoom));
        }

        // Format the doctorName exactly how the dropdown expects it
        let formattedDoctorName = surgery.doctor_name || '';
        if (formattedDoctorName && surgeons && surgeons.length > 0) {
            const cleanDbName = formattedDoctorName.replace(/^Dr\.\s*/i, '').trim();
            const surgeonObj = surgeons.find(s =>
                s.name === formattedDoctorName ||
                `${s.firstname} ${s.lastname}`.trim() === cleanDbName ||
                `${s.lastname} ${s.firstname}`.trim() === cleanDbName
            );
            if (surgeonObj) {
                formattedDoctorName = `Dr. ${surgeonObj.lastname} ${surgeonObj.firstname}`.trim();
            }
        }

        setFormData({
            patientId: surgery.patient_id || '',
            doctorName: formattedDoctorName,
            date: surgery.date || '',
            startTime: formatTimeForInput(surgery.start_time),
            durationMinutes: surgery.duration_minutes || 60,
            turnoverTime: surgery.turnover_time || 20,
            selectedCptCodes: selectedCpts,
            trayCost: trayCostVal || calcTray || 0,
            suppliesCost: surgery.supplies_cost || calcSupplies || 0,
            implantsCost: surgery.implants_cost || calcImplants || 0,
            medicationsCost: surgery.medications_cost || calcMeds || 0,
            labourCost: surgery.actual_labor_cost || calcLabour || 0,
            orRoomCost: surgery.actual_room_cost || calcOrRoom || 0,
            actualStartTime: formatTimeForInput(surgery.actual_start_time || surgery.start_time),
            actualEndTime: formatTimeForInput(surgery.actual_end_time),
            actualDurationMinutes: surgery.actual_duration_minutes || surgery.duration_minutes || 0,
            writeOff: surgery.write_off || 0,
            isProbono: !!surgery.is_probono,
            orRoom: surgery.or_room ? (String(surgery.or_room).startsWith('OR') ? surgery.or_room : `OR ${surgery.or_room}`) : 'OR 1',
            cptExpenses: calcCptExpenses,
            applyFixedCosmeticFee: false, // Per request: always off by default when starting edit, or pull from DB if it existed? Let's default to false as in old system
            cosmeticFacilityFee: calculateCosmeticFees(surgery.duration_minutes || 60).facilityFee,
            cosmeticAnesthesiaFee: calculateCosmeticFees(surgery.duration_minutes || 60).anesthesiaFee,
            orStaffIds: surgery.cpt_expenses?._or_staff_ids || [],
            calculateStaffFee: surgery.cpt_expenses?._calculate_staff_fee || false
        });

        setIsFormOpen(true);
        setTimeout(() => {
            const el = document.getElementById('surgery-form-section');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    // ----- PDF Download Helper -----
    const downloadNotesAsPDF = (surgery, preOptNotes, postOptNotes) => {
        try {
            // Create jsPDF instance
            const pdf = new jsPDF({
                orientation: 'p',
                unit: 'mm',
                format: 'a4'
            });

            // Set fonts and colors
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            let yPosition = 20;
            const margin = 15;
            const contentWidth = pageWidth - (margin * 2);

            // Add header
            pdf.setFillColor(59, 130, 246); // Blue background
            pdf.rect(margin - 5, 10, pageWidth - (margin - 5) * 2, 25, 'F');

            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(24);
            pdf.text('Surgery Notes', margin, 22);

            // Add surgery info
            pdf.setTextColor(0, 0, 0);
            pdf.setFontSize(11);
            yPosition = 40;
            pdf.text(`Patient ID: ${surgery.patient_id || 'N/A'}`, margin, yPosition);
            yPosition += 6;
            pdf.text(`Date: ${surgery.date || 'N/A'}`, margin, yPosition);
            yPosition += 6;
            pdf.text(`Surgeon: ${surgery.doctor_name || 'N/A'}`, margin, yPosition);
            yPosition += 12;

            // Add Pre-Operative section
            pdf.setFillColor(243, 244, 246); // Light gray background
            pdf.rect(margin, yPosition - 5, contentWidth, 8, 'F');
            pdf.setFontSize(13);
            pdf.setFont(undefined, 'bold');
            pdf.setTextColor(59, 130, 246);
            pdf.text('Pre-Operative Findings', margin + 3, yPosition);
            yPosition += 12;

            // Add Pre-Opt content with text wrapping
            pdf.setFont(undefined, 'normal');
            pdf.setFontSize(10);
            pdf.setTextColor(0, 0, 0);
            const preOptText = preOptNotes || 'No pre-operative notes added';
            const preOptLines = pdf.splitTextToSize(preOptText, contentWidth - 2);
            pdf.text(preOptLines, margin + 1, yPosition);
            yPosition += preOptLines.length * 5 + 10;

            // Check if we need a new page
            if (yPosition > pageHeight - 30) {
                pdf.addPage();
                yPosition = 20;
            }

            // Add Post-Operative section
            pdf.setFillColor(243, 244, 246);
            pdf.rect(margin, yPosition - 5, contentWidth, 8, 'F');
            pdf.setFontSize(13);
            pdf.setFont(undefined, 'bold');
            pdf.setTextColor(59, 130, 246);
            pdf.text('Post-Operative Summary', margin + 3, yPosition);
            yPosition += 12;

            // Add Post-Opt content with text wrapping
            pdf.setFont(undefined, 'normal');
            pdf.setFontSize(10);
            pdf.setTextColor(0, 0, 0);
            const postOptText = postOptNotes || 'No post-operative notes added';
            const postOptLines = pdf.splitTextToSize(postOptText, contentWidth - 2);
            pdf.text(postOptLines, margin + 1, yPosition);
            yPosition += postOptLines.length * 5 + 15;

            // Add footer
            pdf.setFontSize(9);
            pdf.setTextColor(153, 153, 153);
            pdf.text(`Generated on: ${new Date().toLocaleString()}`, margin, pageHeight - 15);
            pdf.text('ASC Profitability Platform - Surgery Log & OR Schedule', margin, pageHeight - 10);

            // Download PDF
            const fileName = `Surgery_Notes_${surgery.patient_id}_${surgery.date}.pdf`;
            pdf.save(fileName);

            // Phase 25: Audit Operative Notes PDF Export
            try {
                db.logExportAuditEvent({
                    exportType: 'PDF',
                    tableName: 'surgeries',
                    recordCount: 1,
                    filterMetadata: {
                        surgery_id: surgery.id,
                        patient_id: surgery.patient_id,
                        doctor_name: surgery.doctor_name,
                        date: surgery.date
                    }
                });
            } catch {
                // Non-blocking telemetry
            }

            Swal.fire('Success', 'PDF downloaded successfully!', 'success');
        } catch (error) {
            console.error('Error generating PDF:', error);
            Swal.fire('Error', 'Failed to generate PDF', 'error');
        }
    };

    // ----- Notes Handler -----
    const handleNotes = (surgery) => {
        // Parse existing notes (if stored as JSON)
        let preOptNotes = '';
        let postOptNotes = '';
        let isOldFormat = false;

        try {
            if (surgery.notes && typeof surgery.notes === 'string') {
                // Check if it's JSON format or old text format
                if (surgery.notes.startsWith('{')) {
                    const parsed = JSON.parse(surgery.notes);
                    preOptNotes = parsed.preOpt || '';
                    postOptNotes = parsed.postOpt || '';
                } else {
                    // Old format detected - don't load it automatically
                    isOldFormat = true;
                }
            }
        } catch {
            // If parsing fails, treat as old format
            isOldFormat = true;
        }

        const notesHtml = `
            <div style="text-align: left; width: 100%;">
                <div style="display: flex; gap: 12px; margin-bottom: 16px; border-bottom: 2px solid #e5e7eb;">
                    <button id="tab-preopt" class="notes-tab active" style="flex: 1; padding: 12px; background: #3b82f6; color: white; border: none; border-radius: 4px 4px 0 0; cursor: pointer; font-weight: 600;">
                        Pre-Operative Findings
                    </button>
                    <button id="tab-postopt" class="notes-tab" style="flex: 1; padding: 12px; background: #9ca3af; color: white; border: none; border-radius: 4px 4px 0 0; cursor: pointer; font-weight: 600;">
                        Post-Operative Summary
                    </button>
                </div>
                
                ${isOldFormat ? `<div style="background: #fef3c7; border: 1px solid #f59e0b; padding: 12px; border-radius: 6px; margin-bottom: 12px; font-size: 0.9rem; color: #92400e;">
                    ⚠️ <strong>Note:</strong> Old notes format detected. Starting fresh with empty fields. Previous data will not be loaded.
                </div>` : ''}
                
                <div style="margin-bottom: 12px; padding: 0 8px;">
                    <p style="margin: 0 0 8px 0; font-size: 0.85rem; color: #6b7280;">
                        <strong>Patient:</strong> ${surgery.patient_id || 'N/A'} | 
                        <strong>Date:</strong> ${surgery.date || 'N/A'} | 
                        <strong>Surgeon:</strong> ${surgery.doctor_name || 'N/A'}
                    </p>
                </div>
                
                <div id="tab-content-preopt" style="display: block;">
                    <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 0.9rem;">Key Findings & Pre-Operative Notes</label>
                    <textarea id="preOptInput" placeholder="Enter pre-operative findings, key observations, patient assessment, examination findings..." style="width: 100%; height: 250px; border: 1px solid #d1d5db; border-radius: 6px; padding: 12px; font-family: Arial, sans-serif; font-size: 0.9rem; resize: none;">${preOptNotes}</textarea>
                </div>
                
                <div id="tab-content-postopt" style="display: none;">
                    <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 0.9rem;">Post-Operative Notes & Summary</label>
                    <textarea id="postOptInput" placeholder="Enter post-operative summary, procedure details, findings during surgery, complications (if any), next steps..." style="width: 100%; height: 250px; border: 1px solid #d1d5db; border-radius: 6px; padding: 12px; font-family: Arial, sans-serif; font-size: 0.9rem; resize: none;">${postOptNotes}</textarea>
                </div>
            </div>
        `;

        Swal.fire({
            title: 'Surgery Notes',
            html: notesHtml,
            icon: 'info',
            width: '700px',
            showCancelButton: true,
            confirmButtonText: 'Save Notes',
            cancelButtonText: 'Cancel',
            didOpen: (modal) => {
                const preOptTab = modal.querySelector('#tab-preopt');
                const postOptTab = modal.querySelector('#tab-postopt');
                const preOptContent = modal.querySelector('#tab-content-preopt');
                const postOptContent = modal.querySelector('#tab-content-postopt');
                const preOptInput = modal.querySelector('#preOptInput');
                const postOptInput = modal.querySelector('#postOptInput');

                // Tab switching logic
                preOptTab.addEventListener('click', () => {
                    preOptContent.style.display = 'block';
                    postOptContent.style.display = 'none';
                    preOptTab.style.background = '#3b82f6';
                    postOptTab.style.background = '#9ca3af';
                    preOptInput.focus();
                });

                postOptTab.addEventListener('click', () => {
                    preOptContent.style.display = 'none';
                    postOptContent.style.display = 'block';
                    postOptTab.style.background = '#3b82f6';
                    preOptTab.style.background = '#9ca3af';
                    postOptInput.focus();
                });

                // Add download button to modal
                const modalFooter = modal.querySelector('.swal2-actions');
                if (modalFooter) {
                    const downloadBtn = document.createElement('button');
                    downloadBtn.className = 'swal2-confirm';
                    downloadBtn.style.background = '#10b981';
                    downloadBtn.style.border = 'none';
                    downloadBtn.style.color = 'white';
                    downloadBtn.style.padding = '10px 20px';
                    downloadBtn.style.fontSize = '15px';
                    downloadBtn.style.fontWeight = '600';
                    downloadBtn.style.borderRadius = '6px';
                    downloadBtn.style.cursor = 'pointer';
                    downloadBtn.style.display = 'flex';
                    downloadBtn.style.alignItems = 'center';
                    downloadBtn.style.gap = '8px';
                    downloadBtn.style.transition = 'all 0.3s ease';
                    downloadBtn.innerHTML = '<svg style="width: 18px; height: 18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg><span>Download PDF</span>';

                    // Hover effect
                    downloadBtn.addEventListener('mouseover', () => {
                        downloadBtn.style.background = '#059669';
                        downloadBtn.style.transform = 'translateY(-2px)';
                        downloadBtn.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
                    });

                    downloadBtn.addEventListener('mouseout', () => {
                        downloadBtn.style.background = '#10b981';
                        downloadBtn.style.transform = 'translateY(0)';
                        downloadBtn.style.boxShadow = 'none';
                    });

                    downloadBtn.onclick = () => {
                        const preOptInp = Swal.getHtmlContainer().querySelector('#preOptInput');
                        const postOptInp = Swal.getHtmlContainer().querySelector('#postOptInput');
                        downloadNotesAsPDF(surgery, preOptInp.value, postOptInp.value);
                    };
                    modalFooter.insertBefore(downloadBtn, modalFooter.firstChild);
                }

                preOptInput.focus();
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                const preOptInput = Swal.getHtmlContainer().querySelector('#preOptInput');
                const postOptInput = Swal.getHtmlContainer().querySelector('#postOptInput');

                const notesData = {
                    preOpt: preOptInput.value,
                    postOpt: postOptInput.value
                };

                // Update surgery notes in database as JSON
                try {
                    const notesString = JSON.stringify(notesData);
                    await db.updateSurgery(surgery.id, { notes: notesString });

                    // Update the local surgery object so reopening the modal shows updated data
                    surgery.notes = notesString;

                    // Refresh the surgeries list
                    if (onUpdate) onUpdate();
                    Swal.fire('Success', 'Notes saved successfully!', 'success');
                } catch (error) {
                    console.error('Error saving notes:', error);
                    Swal.fire('Error', 'Failed to save notes', 'error');
                }
            }
        });
    };

    // ----- Submit Handler -----
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.patientId || !formData.doctorName || !formData.startTime) {
            Swal.fire({
                title: 'Error',
                text: 'Please select a patient, surgeon, and start time.',
                icon: 'error',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)'
            });
            return;
        }

        const selectedSurgeonObj = surgeons.find(s => s.name === formData.doctorName || `${s.lastname} ${s.firstname}`.trim() === formData.doctorName.replace(/^Dr\.\s*/i, '').trim());

        // Construct tray cost notes fallback format
        let noteText = '';
        if (formData.trayCost > 0) {
            noteText = `[Tray Cost: ${formData.trayCost}]`;
        }

        // Expected Reimbursement logic
        let reimbursementSum = 0;
        if (formData.applyFixedCosmeticFee) {
            reimbursementSum = formData.cosmeticFacilityFee;
            noteText += (noteText ? '; ' : '') + `Fixed Facility Fee Case - Facility: $${formData.cosmeticFacilityFee.toLocaleString()}, Anesthesia: $${formData.cosmeticAnesthesiaFee.toLocaleString()}`;
        } else {
            formData.selectedCptCodes.forEach(code => {
                const cpt = cptCodes.find(c => String(c.code) === String(code));
                if (cpt) {
                    reimbursementSum += parseFloat(cpt.gross_charge || 0);
                }
            });
        }

        // Room Cost & Labor Cost are now directly mapped from the user-entered CPT expense values
        const roomCost = parseFloat(formData.orRoomCost || 0);
        const laborCost = parseFloat(formData.labourCost || 0);

        // Add calculated staff fees if checkbox is checked
        let calculatedStaffFee = 0;
        if (formData.calculateStaffFee && formData.orStaffIds && formData.orStaffIds.length > 0) {
            let totalHourlyRate = 0;
            formData.orStaffIds.forEach(staffId => {
                const staff = staffList.find(s => s.id === staffId);
                if (staff && staff.hourly_rate) {
                    totalHourlyRate += parseFloat(staff.hourly_rate);
                }
            });
            const durationInHours = (formData.actualDurationMinutes || formData.durationMinutes || 0) / 60;
            calculatedStaffFee = Number((totalHourlyRate * durationInHours).toFixed(2));
        }

        const suppliesCostTotal = parseFloat(formData.suppliesCost || 0) + parseFloat(formData.implantsCost || 0) + parseFloat(formData.medicationsCost || 0) + parseFloat(formData.trayCost || 0);

        // Calculate Full Total based on current UI toggle state
        const internalCost = (includeLaborSupplies ? (roomCost + laborCost + suppliesCostTotal) : 0) + calculatedStaffFee;
        const writeOff = parseFloat(formData.writeOff || 0);

        let patientBillTotal;
        if (formData.isProbono) {
            patientBillTotal = 0;
        } else if (formData.applyFixedCosmeticFee) {
            patientBillTotal = reimbursementSum + roomCost + laborCost + calculatedStaffFee + suppliesCostTotal - writeOff;
        } else {
            patientBillTotal = reimbursementSum - writeOff + internalCost;
        }

        let netProfit = reimbursementSum - writeOff - (roomCost + laborCost + calculatedStaffFee + suppliesCostTotal);
        if (formData.isProbono) netProfit = 0;

        // Save into notes to ensure they are captured in DB
        noteText += (noteText ? ' ' : '') + `[Full Total: ${patientBillTotal}]`;

        const enhancedCptExpenses = {
            ...formData.cptExpenses,
            _full_total: patientBillTotal,
            _net_profit: netProfit,
            _include_labor_supplies: includeLaborSupplies,
            _or_staff_ids: formData.orStaffIds,
            _calculate_staff_fee: formData.calculateStaffFee,
            _staff_fee_total: calculatedStaffFee
        };

        const surgeryData = {
            patient_id: parseInt(formData.patientId),
            surgeon_id: selectedSurgeonObj?.id || null,
            doctor_name: formData.doctorName,
            date: formData.date,
            start_time: formData.startTime,
            duration_minutes: parseInt(formData.durationMinutes),
            turnover_time: parseInt(formData.turnoverTime),
            cpt_codes: formData.selectedCptCodes,
            status: editingSurgery ? editingSurgery.status : 'scheduled',
            supplies_cost: parseFloat(formData.suppliesCost || 0),
            implants_cost: parseFloat(formData.implantsCost || 0),
            medications_cost: parseFloat(formData.medicationsCost || 0),
            notes: noteText || null, // Fallback notes container
            actual_start_time: formData.actualStartTime || formData.startTime || null,
            actual_end_time: formData.actualEndTime || null,
            actual_duration_minutes: parseInt(formData.actualDurationMinutes) || null,
            actual_room_cost: parseFloat(roomCost),
            actual_labor_cost: parseFloat(laborCost),
            expected_reimbursement: parseFloat(reimbursementSum),
            write_off: parseFloat(formData.writeOff || 0),
            is_probono: formData.isProbono,
            or_room: formData.orRoom ? parseInt(formData.orRoom.replace(/\D/g, '')) || null : null,
            cpt_expenses: enhancedCptExpenses
        };

        try {
            if (editingSurgery) {
                await onUpdate(editingSurgery.id, surgeryData);
                Swal.fire({
                    title: 'Updated!',
                    text: 'Surgery details have been updated successfully.',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false,
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)'
                });
            } else {
                await onSchedule(surgeryData);
                Swal.fire({
                    title: 'Scheduled!',
                    text: 'Surgery has been scheduled successfully.',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false,
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)'
                });
            }
            handleCancelEdit();
        } catch (err) {
            console.error(err);
            Swal.fire({
                title: 'Error',
                text: `Failed to save surgery: ${err.message || err.toString()}`,
                icon: 'error',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)'
            });
        }
    };

    // ----- Cancel/Reschedule/Delete Handlers -----
    const handleCancelSurgery = async (id) => {
        const { value: reason } = await Swal.fire({
            title: 'Cancel Surgery?',
            input: 'text',
            inputLabel: 'Reason for cancellation',
            inputPlaceholder: 'e.g., Patient sick, Surgeon unavailable...',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Yes, Cancel it',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            inputValidator: (value) => {
                if (!value) return 'You need to write a reason!';
            }
        });

        if (reason) {
            await onUpdate(id, {
                status: 'cancelled',
                notes: `Cancelled: ${reason}`
            });
            Swal.fire({
                title: 'Cancelled!',
                text: 'Surgery status set to cancelled.',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false,
                background: 'var(--bg-card)',
                color: 'var(--text-primary)'
            });
        }
    };

    const handleCompleteSurgery = async (id) => {
        const confirm = await Swal.fire({
            title: 'Complete Surgery?',
            text: 'Mark this surgery as completed.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: 'var(--color-green)',
            confirmButtonText: 'Yes, complete it',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)'
        });

        if (confirm.isConfirmed) {
            await onUpdate(id, { status: 'completed' });
            Swal.fire({
                title: 'Completed!',
                text: 'Surgery marked as completed.',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false,
                background: 'var(--bg-card)',
                color: 'var(--text-primary)'
            });
        }
    };

    const handleDeleteSurgery = async (id) => {
        const confirm = await Swal.fire({
            title: 'Delete Surgery?',
            text: 'This operation is permanent and cannot be undone.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Yes, delete',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)'
        });

        if (confirm.isConfirmed) {
            await onDelete(id);
            Swal.fire({
                title: 'Deleted!',
                text: 'Surgery removed successfully.',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false,
                background: 'var(--bg-card)',
                color: 'var(--text-primary)'
            });
        }
    };

    // ----- CPT Controls -----
    const handleCptChange = (code, action) => {
        setFormData(prev => {
            let newCodes = [...prev.selectedCptCodes];

            if (action === 'add') {
                newCodes.push(code);
            } else if (action === 'remove') {
                const index = newCodes.lastIndexOf(code);
                if (index > -1) newCodes.splice(index, 1);
            }

            // Recalculate duration & turnover averages based on CPT codes
            let totalDuration = 0;
            let totalTurnover = 0;
            newCodes.forEach(cCode => {
                const cpt = cptCodes.find(c => String(c.code) === String(cCode));
                if (cpt) {
                    totalDuration += parseInt(cpt.average_duration || 60);
                    totalTurnover += parseInt(cpt.turnover_time || 20);
                }
            });

            const newCptExpenses = { ...prev.cptExpenses };

            if (!newCodes.includes(code)) {
                if (newCptExpenses[code]) {
                    delete newCptExpenses[code];
                }
            } else if (action === 'add' && !prev.selectedCptCodes.includes(code)) {
                const extraCostData = otExtraCosts.find(c => String(c.cpt_codes) === String(code));
                const exp = includeLaborSupplies ? {
                    suppliesCost: parseFloat(extraCostData?.supply_cost || 0),
                    implantsCost: parseFloat(extraCostData?.implant_cost || 0),
                    medicationsCost: parseFloat(extraCostData?.medication_cost || 0),
                    trayCost: parseFloat(extraCostData?.tray_cost || 0),
                    labourCost: parseFloat(extraCostData?.labour_cost || 0),
                    orRoomCost: parseFloat(extraCostData?.or_room_cost || 0)
                } : {
                    suppliesCost: 0,
                    implantsCost: 0,
                    medicationsCost: 0,
                    trayCost: 0,
                    labourCost: 0,
                    orRoomCost: 0
                };
                newCptExpenses[code] = exp;
            }

            // Calculate total expenses from all selected CPTs directly
            let totalSupplies = 0;
            let totalImplants = 0;
            let totalMeds = 0;
            let totalTray = 0;
            let totalLabour = 0;
            let totalOrRoom = 0;

            if (newCodes.length > 0) {
                newCodes.forEach(cCode => {
                    const exp = newCptExpenses[cCode];
                    if (exp) {
                        totalSupplies += parseFloat(exp.suppliesCost || 0);
                        totalImplants += parseFloat(exp.implantsCost || 0);
                        totalMeds += parseFloat(exp.medicationsCost || 0);
                        totalTray += parseFloat(exp.trayCost || 0);
                        totalLabour += parseFloat(exp.labourCost || 0);
                        totalOrRoom += parseFloat(exp.orRoomCost || 0);
                    }
                });
            } else {
                // If no CPT codes are selected, revert to whatever they were before (or keep global intact)
                totalSupplies = parseFloat(prev.suppliesCost || 0);
                totalImplants = parseFloat(prev.implantsCost || 0);
                totalMeds = parseFloat(prev.medicationsCost || 0);
                totalTray = parseFloat(prev.trayCost || 0);
                totalLabour = parseFloat(prev.labourCost || 0);
                totalOrRoom = parseFloat(prev.orRoomCost || 0);
            }

            return {
                ...prev,
                selectedCptCodes: newCodes,
                cptExpenses: newCptExpenses,
                durationMinutes: totalDuration > 0 ? totalDuration : prev.durationMinutes,
                turnoverTime: totalTurnover > 0 ? totalTurnover : prev.turnoverTime,
                suppliesCost: totalSupplies,
                implantsCost: totalImplants,
                medicationsCost: totalMeds,
                trayCost: totalTray,
                labourCost: totalLabour,
                orRoomCost: totalOrRoom
            };
        });
    };

    const handleCptExpenseChange = (cptCode, field, value) => {
        setFormData(prev => {
            const numVal = parseFloat(value) || 0;

            const newCptExpenses = {
                ...prev.cptExpenses,
                [cptCode]: {
                    ...prev.cptExpenses[cptCode],
                    [field]: numVal
                }
            };

            // Recalculate total for this field based on all selected CPT codes
            let newTotal = 0;
            prev.selectedCptCodes.forEach(code => {
                newTotal += parseFloat(newCptExpenses[code]?.[field] || 0);
            });

            return {
                ...prev,
                cptExpenses: newCptExpenses,
                [field]: newTotal
            };
        });
    };

    // ----- Financials Calculator helper -----
    const calculateSurgeryFinancials = (surgery) => {
        const grossRevenue = parseFloat(surgery.expected_reimbursement || 0);
        const supplies = parseFloat(surgery.supplies_cost || 0);
        const implants = parseFloat(surgery.implants_cost || 0);
        const meds = parseFloat(surgery.medications_cost || 0);
        const labor = parseFloat(surgery.actual_labor_cost || 0);
        const room = parseFloat(surgery.actual_room_cost || 0);

        // Fetch tray_cost with fallback
        let trayCost = parseFloat(surgery.tray_cost || 0);
        if (trayCost === 0 && surgery.notes) {
            const match = surgery.notes.match(/\[Tray Cost:\s*([\d.]+)\]/);
            if (match) {
                trayCost = parseFloat(match[1]);
            }
        }

        const cost = supplies + implants + meds + labor + room + trayCost;
        const writeOff = parseFloat(surgery.write_off || 0);
        const netRev = surgery.is_probono ? 0 : Math.max(0, grossRevenue - writeOff);

        let displayProfit = netRev;
        let fullTotal = netRev;

        if (surgery.is_probono) {
            displayProfit = 0; // Charity loss
            fullTotal = 0;
        }

        return {
            revenue: netRev,
            grossRevenue,
            supplies,
            implants,
            meds,
            labor,
            room,
            trayCost,
            totalCost: cost,
            netProfit: displayProfit,
            fullTotal
        };
    };

    const surgeriesByMonth = useMemo(() => {
        const groups = {};
        surgeries.forEach(surg => {
            if (!surg.date) return;
            const monthKey = surg.date.substring(0, 7); // "YYYY-MM"
            if (!groups[monthKey]) groups[monthKey] = [];
            groups[monthKey].push(surg);
        });
        return groups;
    }, [surgeries]);

    const availableMonths = useMemo(() => {
        return Object.keys(surgeriesByMonth).sort().reverse();
    }, [surgeriesByMonth]);

    const formatMonthDisplay = (monthKey) => {
        const [year, month] = monthKey.split('-');
        const date = new Date(year, parseInt(month) - 1);
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    };

    const toggleMonth = (monthKey) => {
        setExpandedMonths(prev => {
            const initial = prev.size === 0 && availableMonths.length > 0 ? [availableMonths[0]] : prev;
            const newSet = new Set(initial);
            if (newSet.has(monthKey)) newSet.delete(monthKey);
            else newSet.add(monthKey);
            return newSet;
        });
    };

    // ----- Filtering CPT codes by Specialty / Keyword -----
    const filteredCptCodes = useMemo(() => {
        const surgeonObj = surgeons.find(s => s.name === formData.doctorName || `${s.lastname} ${s.firstname}`.trim() === formData.doctorName.replace(/^Dr\.\s*/i, '').trim());
        const specialty = surgeonObj?.specialty;

        return cptCodes.filter(cpt => {
            // ALWAYS show selected CPTs so they can be viewed/removed at the top
            if (formData.selectedCptCodes.includes(cpt.code)) {
                return true;
            }

            // Search query filter
            const matchesQuery = !cptSearchQuery ||
                cpt.code.toLowerCase().includes(cptSearchQuery.toLowerCase()) ||
                cpt.description.toLowerCase().includes(cptSearchQuery.toLowerCase());

            // If user is actively searching, bypass the specialty/body part filters to allow finding any CPT
            if (cptSearchQuery) {
                return matchesQuery;
            }

            // Specialty filter
            const matchesSpecialty = !specialty || cpt.category === specialty || cpt.category === 'General' || cpt.category === 'General Surgery';
            // Body part filter
            const matchesBodyPart = !selectedBodyPart || (cpt.details?.body_part === selectedBodyPart);

            return matchesSpecialty && matchesQuery && matchesBodyPart;
        }).sort((a, b) => {
            const aSelected = formData.selectedCptCodes.includes(a.code);
            const bSelected = formData.selectedCptCodes.includes(b.code);
            if (aSelected && !bSelected) return -1;
            if (!aSelected && bSelected) return 1;
            return 0;
        });
    }, [cptCodes, formData.doctorName, surgeons, cptSearchQuery, selectedBodyPart, formData.selectedCptCodes]);

    const uniqueSelectedCodes = useMemo(() => {
        return formData.selectedCptCodes.map(code => {
            return cptCodes.find(c => String(c.code) === String(code)) || { code, description: 'Selected CPT Code', gross_charge: 0 };
        });
    }, [formData.selectedCptCodes, cptCodes]);

    // Available body parts mapping from CPTs
    const availableBodyParts = useMemo(() => {
        const parts = new Set();
        cptCodes.forEach(c => {
            if (c.details?.body_part) parts.add(c.details.body_part);
        });
        return Array.from(parts);
    }, [cptCodes]);

    return (
        <div className="management-container fade-in">
            <div className="management-header" style={{ justifyContent: 'flex-end', borderBottom: 'none' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        className="btn-add"
                        onClick={() => setShowSchedule(!showSchedule)}
                        style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)', color: 'var(--color-purple)', borderColor: 'rgba(99, 102, 241, 0.2)' }}
                    >
                        {showSchedule ? 'Hide Calendar' : 'View OR Calendar'}
                    </button>
                    <button className="btn-add btn-primary" onClick={toggleForm}>
                        {isFormOpen ? 'Close Form' : '+ Schedule Surgery'}
                    </button>
                </div>
            </div>

            {/* Visual calendar block schedule */}
            {showSchedule && (
                <div className="content-card fade-in" style={{ marginBottom: '24px' }}>
                    <ORBlockSchedule surgeons={surgeons} embedded={true} />
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Scheduling Input Form */}
                {isFormOpen && (
                    <div id="surgery-form-section" className="content-card fade-in">
                        <div className="card-header">
                            <div>
                                <h3>{editingSurgery ? 'Edit Surgery Log' : 'Schedule New Surgery'}</h3>
                                <p className="card-subtitle">Complete all surgical parameters, including tray costs and operational durations.</p>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="surgery-form">
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Date</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        required
                                        value={formData.date}
                                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Select Patient</label>
                                    <select
                                        className="form-input"
                                        required
                                        value={formData.patientId}
                                        onChange={(e) => setFormData({ ...formData, patientId: e.target.value })}
                                    >
                                        <option value="">-- Select Patient --</option>
                                        {patients.map(p => (
                                            <option key={p.id} value={p.id}>{p.name} ({p.mrn})</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Surgeon Name</label>
                                    <select
                                        className="form-input"
                                        required
                                        value={formData.doctorName}
                                        onChange={(e) => setFormData({ ...formData, doctorName: e.target.value })}
                                    >
                                        <option value="">-- Select Surgeon --</option>
                                        {availableSurgeons.map(s => {
                                            const name = `Dr. ${s.lastname} ${s.firstname}`.trim();
                                            return (
                                                <option key={s.id} value={name}>
                                                    {name} - {s.specialty}
                                                </option>
                                            );
                                        })}
                                        {availableSurgeons.length === 0 && (
                                            <option value="" disabled>No surgeons scheduled for this date</option>
                                        )}
                                    </select>
                                </div>

                                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div className="form-group">
                                        <label>Start Time</label>
                                        <input
                                            type="time"
                                            className="form-input"
                                            required
                                            value={formData.startTime}
                                            onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>OR Room</label>
                                        <select
                                            className="form-input"
                                            value={formData.orRoom}
                                            onChange={(e) => setFormData({ ...formData, orRoom: e.target.value })}
                                        >
                                            <option value="OR 1">OR 1</option>
                                            <option value="Procedure Room">Procedure Room</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Estimated Duration (Minutes)</label>
                                    <select
                                        className="form-input"
                                        required
                                        value={formData.durationMinutes}
                                        onChange={(e) => setFormData({ ...formData, durationMinutes: parseInt(e.target.value) })}
                                    >
                                        {Array.from({ length: 40 }, (_, i) => (i + 1) * 15).map(mins => {
                                            const hours = mins / 60;
                                            return (
                                                <option key={mins} value={mins}>
                                                    {hours >= 1 ? `${Math.floor(hours)} hr ` : ''}{mins % 60 > 0 ? `${mins % 60} min` : ''} ({mins} min)
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Turnover Time (min)</span>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '400' }}>avg room-flip time</span>
                                    </label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <input
                                            type="number"
                                            className="form-input"
                                            min={5}
                                            max={120}
                                            step={5}
                                            required
                                            placeholder="e.g. 20"
                                            value={formData.turnoverTime || ''}
                                            onChange={(e) => setFormData({ ...formData, turnoverTime: parseInt(e.target.value) || 20 })}
                                            style={{ width: '100%' }}
                                        />
                                        {/* Quick-pick preset buttons */}
                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                            {[10, 15, 20, 25, 30, 45].map(t => (
                                                <button
                                                    key={t}
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, turnoverTime: t })}
                                                    style={{
                                                        padding: '2px 8px',
                                                        fontSize: '0.72rem',
                                                        borderRadius: '4px',
                                                        border: '1px solid',
                                                        cursor: 'pointer',
                                                        fontWeight: '600',
                                                        transition: 'all 0.15s',
                                                        borderColor: formData.turnoverTime === t ? 'var(--color-blue)' : 'var(--border-color)',
                                                        background: formData.turnoverTime === t ? 'rgba(59,130,246,0.15)' : 'transparent',
                                                        color: formData.turnoverTime === t ? 'var(--color-blue)' : 'var(--text-secondary)'
                                                    }}
                                                >
                                                    {t}m
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {isCosmeticSurgeon && (
                                <div className="form-group" style={{
                                    marginTop: '8px',
                                    marginBottom: '16px',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    background: formData.applyFixedCosmeticFee ? '#fff7ed' : '#f8fafc',
                                    border: `2px solid ${formData.applyFixedCosmeticFee ? '#fb923c' : '#e2e8f0'}`,
                                    transition: 'all 0.2s ease'
                                }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
                                        <input
                                            type="checkbox"
                                            checked={formData.applyFixedCosmeticFee}
                                            onChange={(e) => setFormData({ ...formData, applyFixedCosmeticFee: e.target.checked })}
                                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                        />
                                        <span style={{ fontSize: '0.95rem', fontWeight: '700', color: formData.applyFixedCosmeticFee ? '#c2410c' : 'var(--text-color)' }}>
                                            Apply Fixed Facility Fee (Cosmetic/Plastics)
                                        </span>
                                    </label>

                                    {formData.applyFixedCosmeticFee && (
                                        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #fed7aa' }}>
                                            <div>
                                                <div style={{ fontSize: '0.75rem', color: '#9a3412', fontWeight: '600', marginBottom: '4px', textTransform: 'uppercase' }}>Est. Facility Fee</div>
                                                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#ea580c' }}>{formatCurrency(formData.cosmeticFacilityFee)}</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* CPT Codes Selection */}
                            <div className="form-group">
                                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>Select CPT Codes</span>
                                    {uniqueSelectedCodes.length > 0 && (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--color-blue)', fontWeight: '700' }}>
                                            {uniqueSelectedCodes.length} Selected
                                        </span>
                                    )}
                                </label>

                                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                    <div style={{ position: 'relative', flex: '1' }}>
                                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--text-muted)' }} />
                                        <input
                                            type="text"
                                            placeholder="Search code or description..."
                                            className="form-input"
                                            style={{ paddingLeft: '30px' }}
                                            value={cptSearchQuery}
                                            onChange={(e) => setCptSearchQuery(e.target.value)}
                                        />
                                    </div>
                                    {availableBodyParts.length > 0 && (
                                        <select
                                            className="filter-select"
                                            value={selectedBodyPart}
                                            onChange={(e) => setSelectedBodyPart(e.target.value)}
                                        >
                                            <option value="">All Body Parts</option>
                                            {availableBodyParts.map(p => (
                                                <option key={p} value={p}>{p}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>

                                <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px' }}>
                                    <div className="cpt-grid">
                                        {filteredCptCodes.map(c => {
                                            const count = formData.selectedCptCodes.filter(code => code === c.code).length;
                                            const isSelected = count > 0;
                                            return (
                                                <div
                                                    key={c.code}
                                                    className={`cpt-card ${isSelected ? 'selected' : ''}`}
                                                    style={{ display: 'flex', flexDirection: 'column' }}
                                                >
                                                    <div className="cpt-card-header">
                                                        <span className="cpt-code-badge">{c.code} {count > 1 ? `(x${count})` : ''}</span>
                                                        <span className="cpt-price">{formatCurrency(c.gross_charge)}</span>
                                                    </div>
                                                    <span className="cpt-description" style={{ flex: 1 }}>{c.description}</span>
                                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px', gap: '8px' }}>
                                                        {count > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); handleCptChange(c.code, 'remove'); }}
                                                                style={{ padding: '4px 8px', borderRadius: '4px', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                                                            >
                                                                - Remove
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); handleCptChange(c.code, 'add'); }}
                                                            style={{ padding: '4px 8px', borderRadius: '4px', background: 'var(--color-blue)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                                                        >
                                                            + Add
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Supplies, Implants, Tray Cost, Medications, Labour, OR Room */}
                            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '4px' }}>
                                <h4 style={{ fontSize: '0.85rem', color: 'var(--text-primary)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px' }}>Material & Facility Expenses</h4>
                                {formData.selectedCptCodes.length === 0 ? (
                                    <div className="form-row" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
                                        <div className="form-group">
                                            <label style={{ fontSize: '0.7rem' }}>Supply Cost</label>
                                            <div style={{ position: 'relative' }}>
                                                <DollarSign size={12} style={{ position: 'absolute', left: '10px', top: '14px', color: 'var(--text-muted)' }} />
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className="form-input"
                                                    style={{ paddingLeft: '24px', paddingRight: '5px' }}
                                                    value={formData.suppliesCost || ''}
                                                    onChange={(e) => setFormData({ ...formData, suppliesCost: parseFloat(e.target.value) || 0 })}
                                                />
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label style={{ fontSize: '0.7rem' }}>Implants & Devices</label>
                                            <div style={{ position: 'relative' }}>
                                                <DollarSign size={12} style={{ position: 'absolute', left: '10px', top: '14px', color: 'var(--text-muted)' }} />
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className="form-input"
                                                    style={{ paddingLeft: '24px', paddingRight: '5px' }}
                                                    value={formData.implantsCost || ''}
                                                    onChange={(e) => setFormData({ ...formData, implantsCost: parseFloat(e.target.value) || 0 })}
                                                />
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label style={{ fontSize: '0.7rem' }}>Tray Cost (New)</label>
                                            <div style={{ position: 'relative' }}>
                                                <DollarSign size={12} style={{ position: 'absolute', left: '10px', top: '14px', color: 'var(--text-muted)' }} />
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className="form-input"
                                                    style={{ paddingLeft: '24px', paddingRight: '5px' }}
                                                    value={formData.trayCost || ''}
                                                    onChange={(e) => setFormData({ ...formData, trayCost: parseFloat(e.target.value) || 0 })}
                                                />
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label style={{ fontSize: '0.7rem' }}>Medications</label>
                                            <div style={{ position: 'relative' }}>
                                                <DollarSign size={12} style={{ position: 'absolute', left: '10px', top: '14px', color: 'var(--text-muted)' }} />
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className="form-input"
                                                    style={{ paddingLeft: '24px', paddingRight: '5px' }}
                                                    value={formData.medicationsCost || ''}
                                                    onChange={(e) => setFormData({ ...formData, medicationsCost: parseFloat(e.target.value) || 0 })}
                                                />
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label style={{ fontSize: '0.7rem' }}>Labour Cost</label>
                                            <div style={{ position: 'relative' }}>
                                                <DollarSign size={12} style={{ position: 'absolute', left: '10px', top: '14px', color: 'var(--text-muted)' }} />
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className="form-input"
                                                    style={{ paddingLeft: '24px', paddingRight: '5px' }}
                                                    value={formData.labourCost || ''}
                                                    onChange={(e) => setFormData({ ...formData, labourCost: parseFloat(e.target.value) || 0 })}
                                                />
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label style={{ fontSize: '0.7rem' }}>OR Room Cost</label>
                                            <div style={{ position: 'relative' }}>
                                                <DollarSign size={12} style={{ position: 'absolute', left: '10px', top: '14px', color: 'var(--text-muted)' }} />
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className="form-input"
                                                    style={{ paddingLeft: '24px', paddingRight: '5px' }}
                                                    value={formData.orRoomCost || ''}
                                                    onChange={(e) => setFormData({ ...formData, orRoomCost: parseFloat(e.target.value) || 0 })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {Array.from(new Set(formData.selectedCptCodes)).map(code => {
                                            const count = formData.selectedCptCodes.filter(c => c === code).length;
                                            return (
                                                <div key={code} style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '8px', color: 'var(--primary-color)' }}>CPT {code} Expenses {count > 1 ? `(x${count})` : ''}</div>
                                                    <div className="form-row" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
                                                        <div className="form-group">
                                                            <label style={{ fontSize: '0.7rem' }}>Supply Cost</label>
                                                            <div style={{ position: 'relative' }}>
                                                                <DollarSign size={12} style={{ position: 'absolute', left: '10px', top: '14px', color: 'var(--text-muted)' }} />
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    className="form-input"
                                                                    style={{ paddingLeft: '24px', paddingRight: '5px' }}
                                                                    value={formData.cptExpenses[code]?.suppliesCost || ''}
                                                                    onChange={(e) => handleCptExpenseChange(code, 'suppliesCost', e.target.value)}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="form-group">
                                                            <label style={{ fontSize: '0.7rem' }}>Implants & Devices</label>
                                                            <div style={{ position: 'relative' }}>
                                                                <DollarSign size={12} style={{ position: 'absolute', left: '10px', top: '14px', color: 'var(--text-muted)' }} />
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    className="form-input"
                                                                    style={{ paddingLeft: '24px', paddingRight: '5px' }}
                                                                    value={formData.cptExpenses[code]?.implantsCost || ''}
                                                                    onChange={(e) => handleCptExpenseChange(code, 'implantsCost', e.target.value)}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="form-group">
                                                            <label style={{ fontSize: '0.7rem' }}>Tray Cost (New)</label>
                                                            <div style={{ position: 'relative' }}>
                                                                <DollarSign size={12} style={{ position: 'absolute', left: '10px', top: '14px', color: 'var(--text-muted)' }} />
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    className="form-input"
                                                                    style={{ paddingLeft: '24px', paddingRight: '5px' }}
                                                                    value={formData.cptExpenses[code]?.trayCost || ''}
                                                                    onChange={(e) => handleCptExpenseChange(code, 'trayCost', e.target.value)}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="form-group">
                                                            <label style={{ fontSize: '0.7rem' }}>Medications</label>
                                                            <div style={{ position: 'relative' }}>
                                                                <DollarSign size={12} style={{ position: 'absolute', left: '10px', top: '14px', color: 'var(--text-muted)' }} />
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    className="form-input"
                                                                    style={{ paddingLeft: '24px', paddingRight: '5px' }}
                                                                    value={formData.cptExpenses[code]?.medicationsCost || ''}
                                                                    onChange={(e) => handleCptExpenseChange(code, 'medicationsCost', e.target.value)}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="form-group">
                                                            <label style={{ fontSize: '0.7rem' }}>Labour Cost</label>
                                                            <div style={{ position: 'relative' }}>
                                                                <DollarSign size={12} style={{ position: 'absolute', left: '10px', top: '14px', color: 'var(--text-muted)' }} />
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    className="form-input"
                                                                    style={{ paddingLeft: '24px', paddingRight: '5px' }}
                                                                    value={formData.cptExpenses[code]?.labourCost || ''}
                                                                    onChange={(e) => handleCptExpenseChange(code, 'labourCost', e.target.value)}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="form-group">
                                                            <label style={{ fontSize: '0.7rem' }}>OR Room Cost</label>
                                                            <div style={{ position: 'relative' }}>
                                                                <DollarSign size={12} style={{ position: 'absolute', left: '10px', top: '14px', color: 'var(--text-muted)' }} />
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    className="form-input"
                                                                    style={{ paddingLeft: '24px', paddingRight: '5px' }}
                                                                    value={formData.cptExpenses[code]?.orRoomCost || ''}
                                                                    onChange={(e) => handleCptExpenseChange(code, 'orRoomCost', e.target.value)}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {/* Show grand totals summary if multiple CPTs */}
                                        {formData.selectedCptCodes.length > 1 && (
                                            <div style={{ padding: '8px 12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>Surgery Grand Total Expenses:</span>
                                                <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem', color: 'var(--text-primary)' }}>
                                                    <span>Supplies: {formatCurrency(formData.suppliesCost)}</span>
                                                    <span>Implants: {formatCurrency(formData.implantsCost)}</span>
                                                    <span>Tray: {formatCurrency(formData.trayCost)}</span>
                                                    <span>Meds: {formatCurrency(formData.medicationsCost)}</span>
                                                    <span>Labour: {formatCurrency(formData.labourCost)}</span>
                                                    <span>OR Room: {formatCurrency(formData.orRoomCost)}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Actual Timing overrides */}
                            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '4px' }}>
                                <h4 style={{ fontSize: '0.85rem', color: 'var(--text-primary)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px' }}>Actual Timing log (Post-Op)</h4>
                                <div className="form-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                                    <div className="form-group">
                                        <label>Actual Start Time</label>
                                        <input
                                            type="time"
                                            className="form-input"
                                            value={formData.actualStartTime}
                                            onChange={(e) => setFormData({ ...formData, actualStartTime: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Actual End Time</label>
                                        <input
                                            type="time"
                                            className="form-input"
                                            value={formData.actualEndTime}
                                            onChange={(e) => {
                                                const start = formData.actualStartTime || formData.startTime;
                                                const end = e.target.value;
                                                let duration = formData.actualDurationMinutes;
                                                if (start && end) {
                                                    const [sH, sM] = start.split(':').map(Number);
                                                    const [eH, eM] = end.split(':').map(Number);
                                                    duration = (eH * 60 + eM) - (sH * 60 + sM);
                                                    if (duration < 0) duration += 1440;
                                                }
                                                setFormData({ ...formData, actualEndTime: end, actualDurationMinutes: duration });
                                            }}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Actual Duration (Minutes)</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            placeholder="Auto-calculated"
                                            value={formData.actualDurationMinutes || ''}
                                            onChange={(e) => setFormData({ ...formData, actualDurationMinutes: parseInt(e.target.value) || 0 })}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* OR Staff Selection */}
                            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '4px' }}>
                                <h4 style={{ fontSize: '0.85rem', color: 'var(--text-primary)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px' }}>OR Staff Management</h4>
                                <div className="form-row" style={{ gridTemplateColumns: '1fr' }}>
                                    <div className="form-group">
                                        <label>Select OR Staff</label>
                                        <div style={{
                                            maxHeight: '150px',
                                            overflowY: 'auto',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '6px',
                                            padding: '8px',
                                            background: 'var(--bg-input)'
                                        }}>
                                            {staffList.filter(staff => staff.department === 'Operating Room RN').map(staff => {
                                                const isSelected = (formData.orStaffIds || []).includes(staff.id);
                                                return (
                                                    <label key={staff.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px', cursor: 'pointer', borderRadius: '4px', background: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'transparent', transition: 'background 0.2s' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={(e) => {
                                                                const currentIds = formData.orStaffIds || [];
                                                                if (e.target.checked) {
                                                                    setFormData({ ...formData, orStaffIds: [...currentIds, staff.id] });
                                                                } else {
                                                                    setFormData({ ...formData, orStaffIds: currentIds.filter(id => id !== staff.id) });
                                                                }
                                                            }}
                                                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                                        />
                                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                                                            {staff.firstname} {staff.lastname} - {staff.department} (${staff.hourly_rate}/hr)
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                            {staffList.filter(staff => staff.department === 'Operating Room RN').length === 0 && (
                                                <div style={{ padding: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>No OR RNs found.</div>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '8px' }}>
                                        <input
                                            type="checkbox"
                                            id="calculateStaffFee"
                                            checked={formData.calculateStaffFee}
                                            onChange={(e) => setFormData({ ...formData, calculateStaffFee: e.target.checked })}
                                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                        />
                                        <label htmlFor="calculateStaffFee" style={{ fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: '600' }}>
                                            Calculate staff fees based on actual OR time (overrides Labour Cost)
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Write-offs and Pro-bono options */}
                            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '4px' }}>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Write-Off Amount ($)</label>
                                        <div style={{ position: 'relative' }}>
                                            <DollarSign size={12} style={{ position: 'absolute', left: '10px', top: '14px', color: 'var(--text-muted)' }} />
                                            <input
                                                type="number"
                                                step="0.01"
                                                className="form-input"
                                                style={{ paddingLeft: '24px' }}
                                                value={formData.writeOff || ''}
                                                onChange={(e) => setFormData({ ...formData, writeOff: parseFloat(e.target.value) || 0 })}
                                            />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '16px' }}>
                                        <input
                                            type="checkbox"
                                            id="isProbono"
                                            checked={formData.isProbono}
                                            onChange={(e) => setFormData({ ...formData, isProbono: e.target.checked })}
                                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                        />
                                        <label htmlFor="isProbono" style={{ fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: '600' }}>
                                            💗 Mark as Charity/Pro-Bono Case
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Financial Projection Box */}
                            {(formData.selectedCptCodes.length > 0 || formData.applyFixedCosmeticFee || formData.isProbono) && (
                                <div style={{
                                    marginTop: '24px',
                                    padding: '20px',
                                    borderRadius: '12px',
                                    background: formData.isProbono ? '#fdf2f8' : (formData.applyFixedCosmeticFee ? '#eff6ff' : 'rgba(16, 185, 129, 0.05)'),
                                    border: `2px solid ${formData.isProbono ? '#db2777' : (formData.applyFixedCosmeticFee ? '#3b82f6' : 'var(--success-color)')}`,
                                    position: 'relative'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {!formData.applyFixedCosmeticFee && !formData.isProbono && (
                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--success-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg>
                                            )}
                                            <h3 style={{ margin: 0, fontSize: '1.1rem', color: formData.isProbono ? '#9d174d' : (formData.applyFixedCosmeticFee ? '#1e40af' : 'var(--text-color)'), fontWeight: '700' }}>
                                                {formData.isProbono ? '💗 Pro-Bono Case Summary' : (formData.applyFixedCosmeticFee ? '💰 Cosmetic Fee Breakdown' : 'Financial Projection')}
                                            </h3>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={includeLaborSupplies}
                                                    onChange={(e) => {
                                                        const isChecked = e.target.checked;
                                                        setIncludeLaborSupplies(isChecked);
                                                        setFormData(prev => {
                                                            const newCptExpenses = { ...prev.cptExpenses };
                                                            let totalSupplies = 0, totalImplants = 0, totalMeds = 0, totalTray = 0, totalLabour = 0, totalOrRoom = 0;

                                                            if (!isChecked) {
                                                                Object.keys(newCptExpenses).forEach(code => {
                                                                    newCptExpenses[code] = {
                                                                        ...newCptExpenses[code],
                                                                        suppliesCost: 0, implantsCost: 0, medicationsCost: 0, trayCost: 0, labourCost: 0, orRoomCost: 0
                                                                    };
                                                                });
                                                            } else {
                                                                prev.selectedCptCodes.forEach(code => {
                                                                    const extraCostData = otExtraCosts.find(c => String(c.cpt_codes) === String(code));
                                                                    const currentExp = newCptExpenses[code] || {};
                                                                    newCptExpenses[code] = {
                                                                        ...currentExp,
                                                                        suppliesCost: currentExp.suppliesCost || parseFloat(extraCostData?.supply_cost || 0),
                                                                        implantsCost: currentExp.implantsCost || parseFloat(extraCostData?.implant_cost || 0),
                                                                        medicationsCost: currentExp.medicationsCost || parseFloat(extraCostData?.medication_cost || 0),
                                                                        trayCost: currentExp.trayCost || parseFloat(extraCostData?.tray_cost || 0),
                                                                        labourCost: currentExp.labourCost || parseFloat(extraCostData?.labour_cost || 0),
                                                                        orRoomCost: currentExp.orRoomCost || parseFloat(extraCostData?.or_room_cost || 0)
                                                                    };
                                                                });
                                                            }

                                                            Object.keys(newCptExpenses).forEach(code => {
                                                                totalSupplies += newCptExpenses[code].suppliesCost;
                                                                totalImplants += newCptExpenses[code].implantsCost;
                                                                totalMeds += newCptExpenses[code].medicationsCost;
                                                                totalTray += newCptExpenses[code].trayCost;
                                                                totalLabour += newCptExpenses[code].labourCost;
                                                                totalOrRoom += newCptExpenses[code].orRoomCost;
                                                            });

                                                            return {
                                                                ...prev,
                                                                cptExpenses: newCptExpenses,
                                                                suppliesCost: totalSupplies,
                                                                implantsCost: totalImplants,
                                                                medicationsCost: totalMeds,
                                                                trayCost: totalTray,
                                                                labourCost: totalLabour,
                                                                orRoomCost: totalOrRoom
                                                            };
                                                        });
                                                    }}
                                                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                                />
                                                Include Labor/Supplies
                                            </label>
                                        </div>
                                    </div>

                                    {(() => {
                                        let revenue = 0;
                                        if (formData.applyFixedCosmeticFee) {
                                            revenue = formData.cosmeticFacilityFee;
                                        } else {
                                            formData.selectedCptCodes.forEach(code => {
                                                const cpt = cptCodes.find(c => String(c.code) === String(code));
                                                if (cpt) revenue += parseFloat(cpt.gross_charge || 0);
                                            });
                                        }
                                        const room = parseFloat(formData.orRoomCost || 0);
                                        const labor = parseFloat(formData.labourCost || 0);

                                        let calculatedStaffFee = 0;
                                        if (formData.calculateStaffFee && formData.orStaffIds && formData.orStaffIds.length > 0) {
                                            let totalHourlyRate = 0;
                                            formData.orStaffIds.forEach(staffId => {
                                                const staff = staffList.find(s => s.id === staffId);
                                                if (staff && staff.hourly_rate) {
                                                    totalHourlyRate += parseFloat(staff.hourly_rate);
                                                }
                                            });
                                            const durationInHours = (formData.actualDurationMinutes || formData.durationMinutes || 0) / 60;
                                            calculatedStaffFee = Number((totalHourlyRate * durationInHours).toFixed(2));
                                        }

                                        const supplies = parseFloat(formData.suppliesCost || 0) + parseFloat(formData.implantsCost || 0) + parseFloat(formData.medicationsCost || 0) + parseFloat(formData.trayCost || 0);
                                        const internalCost = (includeLaborSupplies ? (room + labor + supplies) : 0) + calculatedStaffFee;
                                        const writeOff = parseFloat(formData.writeOff || 0);

                                        return (
                                            <>
                                                {formData.applyFixedCosmeticFee ? (
                                                    <div style={{ marginBottom: '16px', fontSize: '0.9rem', color: '#1e40af', backgroundColor: '#dbeafe', padding: '12px', borderRadius: '6px', borderLeft: '4px solid #3b82f6' }}>
                                                        <strong>Note:</strong> When enabled, the surgery will be billed as a flat-rate cosmetic case based on duration, ignoring CPT reimbursements for facility revenue.
                                                    </div>
                                                ) : null}
                                                {(() => {
                                                    const isLightBg = formData.isProbono || formData.applyFixedCosmeticFee;
                                                    const labelColor = isLightBg ? '#475569' : 'var(--text-secondary)';
                                                    const valGreen = isLightBg ? '#166534' : 'var(--color-green)';
                                                    const valRed = isLightBg ? '#991b1b' : 'var(--color-red)';

                                                    return (
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                                                            <div>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '0.85rem' }}>
                                                                    <span style={{ color: labelColor }}>{formData.applyFixedCosmeticFee ? 'Facility Fee:' : 'Rev (CPT+Fee):'}</span>
                                                                    <span style={{ fontWeight: 'bold', color: valGreen }}>{formatCurrency(revenue)}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                                                    <span style={{ color: valRed }}>Write-Off / Disc:</span>
                                                                    <span style={{ fontWeight: 'bold', color: valRed }}>- {formatCurrency(writeOff)}</span>
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '0.85rem' }}>
                                                                    <span style={{ color: labelColor }}>Actual Room Cost:</span>
                                                                    <span style={{ fontWeight: 'bold', color: valRed }}>{formatCurrency((includeLaborSupplies || formData.isProbono) ? room : 0)}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                                                    <span style={{ color: labelColor }}>Actual Labor:</span>
                                                                    <span style={{ fontWeight: 'bold', color: valRed }}>{formatCurrency((includeLaborSupplies || formData.isProbono) ? labor : 0)}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                                                    <span style={{ color: labelColor }}>Staff Fees:</span>
                                                                    <span style={{ fontWeight: 'bold', color: valRed }}>{formatCurrency(calculatedStaffFee)}</span>
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.85rem' }}>
                                                                    <span style={{ color: labelColor }}>Supplies:</span>
                                                                    <span style={{ fontWeight: 'bold', color: valRed }}>{formatCurrency((includeLaborSupplies || formData.isProbono) ? parseFloat(formData.suppliesCost || 0) : 0)}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.85rem' }}>
                                                                    <span style={{ color: labelColor }}>Implants:</span>
                                                                    <span style={{ fontWeight: 'bold', color: valRed }}>{formatCurrency((includeLaborSupplies || formData.isProbono) ? parseFloat(formData.implantsCost || 0) : 0)}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.85rem' }}>
                                                                    <span style={{ color: labelColor }}>Tray:</span>
                                                                    <span style={{ fontWeight: 'bold', color: valRed }}>{formatCurrency((includeLaborSupplies || formData.isProbono) ? parseFloat(formData.trayCost || 0) : 0)}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                                                    <span style={{ color: labelColor }}>Meds:</span>
                                                                    <span style={{ fontWeight: 'bold', color: valRed }}>{formatCurrency((includeLaborSupplies || formData.isProbono) ? parseFloat(formData.medicationsCost || 0) : 0)}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '16px 0', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <span style={{ fontWeight: 'bold', fontSize: '0.9rem', color: formData.applyFixedCosmeticFee ? '#1e40af' : 'inherit' }}>
                                                            {formData.applyFixedCosmeticFee ? 'Total Fees Paid by User:' : 'Full Total:'}
                                                        </span>
                                                        {(() => {
                                                            let patientBillTotal = 0;
                                                            if (!formData.isProbono) {
                                                                patientBillTotal = formData.applyFixedCosmeticFee ?
                                                                    (formData.cosmeticFacilityFee + room + labor + calculatedStaffFee + supplies - writeOff) :
                                                                    (revenue + internalCost - writeOff);
                                                            }
                                                            return (
                                                                <span style={{ fontWeight: 'bold', fontSize: '1.2rem', color: formData.applyFixedCosmeticFee ? '#1d4ed8' : (patientBillTotal >= 0 ? 'var(--success-color)' : 'var(--danger-color)') }}>
                                                                    {formatCurrency(patientBillTotal)}
                                                                </span>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            )}

                            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
                                <button type="button" className="btn-cancel" onClick={handleCancelEdit}>Cancel</button>
                                <button type="submit" className="btn-save">{editingSurgery ? 'Save Changes' : 'Schedule Case'}</button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Monthly Surgeries Log Tables */}
                <div>
                    <div className="content-card">
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3>Monthly Case Logs</h3>
                                <p className="card-subtitle">Review MTD case list sorted by calendar month with itemized financials.</p>
                            </div>
                        </div>

                        {availableMonths.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                <Clock size={32} style={{ opacity: 0.2, marginBottom: '8px' }} />
                                <div style={{ fontSize: '0.85rem', fontWeight: '600' }}>No surgeries scheduled.</div>
                            </div>
                        ) : (
                            availableMonths.map(monthKey => {
                                const monthSurgeries = surgeriesByMonth[monthKey] || [];
                                const isExpanded = expandedMonths.size === 0 ? monthKey === availableMonths[0] : expandedMonths.has(monthKey);

                                // Apply month-specific search
                                const searchQuery = (monthSearchQueries[monthKey] || '').toLowerCase().trim();
                                const filteredMonthSurgeries = searchQuery ? monthSurgeries.filter(surg => {
                                    const patientObj = patients.find(p => String(p.id) === String(surg.patient_id));
                                    const patientMrn = patientObj ? patientObj.mrn : (surg.patients ? surg.patients.mrn : '');
                                    const searchable = `${patientMrn} ${surg.doctor_name || ''} ${surg.cpt_codes || ''} ${surg.status || ''}`.toLowerCase();
                                    return searchable.includes(searchQuery);
                                }) : monthSurgeries;

                                // Month total price
                                const monthTotalPrice = filteredMonthSurgeries.reduce((sum, s) => {
                                    const { fullTotal } = calculateSurgeryFinancials(s);
                                    return sum + fullTotal;
                                }, 0);

                                // Pagination calculation
                                const currentPage = monthPages[monthKey] || 1;
                                const perPage = monthSurgeriesPerPage[monthKey] || 10;
                                const totalPages = Math.ceil(filteredMonthSurgeries.length / perPage);
                                const currentSurgeries = filteredMonthSurgeries.slice(
                                    (currentPage - 1) * perPage,
                                    currentPage * perPage
                                );

                                return (
                                    <div key={monthKey} style={{ marginBottom: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                                        {/* Month Header Accordion */}
                                        <div
                                            onClick={() => toggleMonth(monthKey)}
                                            style={{
                                                padding: '12px 16px',
                                                background: 'var(--bg-card)',
                                                borderLeft: '4px solid var(--color-blue)',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}>
                                                {isExpanded ? <ChevronUp size={18} style={{ color: 'var(--color-blue)' }} /> : <ChevronDown size={18} style={{ color: 'var(--text-secondary)' }} />}
                                                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                                                    {formatMonthDisplay(monthKey)}
                                                </h4>
                                                <span style={{ fontSize: '0.75rem', padding: '2px 10px', background: 'var(--bg-subtab)', borderRadius: '12px', color: 'var(--text-secondary)', fontWeight: '600', border: '1px solid var(--border-light)' }}>
                                                    {filteredMonthSurgeries.length} cases
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                                {/* Month Search Bar */}
                                                <div
                                                    onClick={(e) => e.stopPropagation()}
                                                    style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 10px' }}
                                                >
                                                    <Search size={14} color="var(--text-secondary)" style={{ marginRight: '6px' }} />
                                                    <input
                                                        type="text"
                                                        placeholder="Search MRN, Surgeon..."
                                                        value={monthSearchQueries[monthKey] || ''}
                                                        onChange={(e) => setMonthSearchQueries(prev => ({ ...prev, [monthKey]: e.target.value }))}
                                                        style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', color: 'var(--text-primary)', width: '180px' }}
                                                    />
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Show:</label>
                                                    <select
                                                        value={monthSurgeriesPerPage[monthKey] || 10}
                                                        onChange={(e) => setMonthSurgeriesPerPage(prev => ({ ...prev, [monthKey]: Number(e.target.value) }))}
                                                        style={{ padding: '2px 4px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
                                                    >
                                                        <option value={5}>5</option>
                                                        <option value={10}>10</option>
                                                        <option value={20}>20</option>
                                                        <option value={50}>50</option>
                                                    </select>
                                                </div>
                                                <span style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--color-green)' }}>
                                                    {formatCurrency(monthTotalPrice)}
                                                </span>
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div className="table-container">
                                                <table className="data-table">
                                                    <thead>
                                                        <tr>
                                                            <th>Patient MRN</th>
                                                            <th>Date</th>
                                                            <th>Time</th>
                                                            <th>Surgeon</th>
                                                            <th>CPT Code(s)</th>
                                                            <th>Occupancy</th>
                                                            <th>Tray Cost</th>
                                                            <th>Total Price</th>
                                                            <th>Status</th>
                                                            <th>Actions</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {currentSurgeries.map(s => {
                                                            const patientObj = patients.find(p => String(p.id) === String(s.patient_id));
                                                            const patientMrn = patientObj ? patientObj.mrn : (s.patients ? s.patients.mrn : '---');

                                                            // Parse CPT codes array
                                                            let selectedCpts = [];
                                                            if (Array.isArray(s.cpt_codes)) {
                                                                selectedCpts = s.cpt_codes;
                                                            } else if (typeof s.cpt_codes === 'string') {
                                                                try {
                                                                    const parsed = JSON.parse(s.cpt_codes);
                                                                    if (Array.isArray(parsed)) {
                                                                        selectedCpts = parsed.map(String);
                                                                    } else {
                                                                        selectedCpts = s.cpt_codes.replace(/[[\]"']/g, '').split(',').map(str => str.trim()).filter(Boolean);
                                                                    }
                                                                } catch {
                                                                    selectedCpts = s.cpt_codes.replace(/[[\]"']/g, '').split(',').map(str => str.trim()).filter(Boolean);
                                                                }
                                                            }

                                                            const { trayCost, fullTotal } = calculateSurgeryFinancials(s);

                                                            const isCosmetic = s.notes && s.notes.includes('Fixed Facility Fee Case');

                                                            return (
                                                                <tr key={s.id}>
                                                                    <td style={{ color: 'var(--color-blue)', fontWeight: '600' }}>{patientMrn}</td>
                                                                    <td>{s.date}</td>
                                                                    <td>{formatTimeForInput(s.start_time)}</td>
                                                                    <td style={{ fontWeight: '500' }}>{s.doctor_name}</td>
                                                                    <td>
                                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                                                                            {isCosmetic && (
                                                                                <span style={{ backgroundColor: '#f59e0b', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                                    <Wand2 size={12} />
                                                                                    Cosmetic Surgery
                                                                                </span>
                                                                            )}
                                                                            {selectedCpts.length > 0 ? (
                                                                                selectedCpts.map(code => (
                                                                                    <span key={code} className="badge badge-blue">{code}</span>
                                                                                ))
                                                                            ) : (!isCosmetic && (
                                                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>None</span>
                                                                            ))}
                                                                        </div>
                                                                    </td>
                                                                    <td>
                                                                        <div>{s.duration_minutes || 0}m + <span style={{ color: 'var(--color-orange)' }}>{s.turnover_time || 0}m</span></div>
                                                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>turnover</div>
                                                                    </td>
                                                                    <td style={{ fontFamily: 'monospace' }}>{formatCurrency(trayCost)}</td>
                                                                    <td style={{ fontWeight: '700', color: 'var(--color-green)' }}>
                                                                        {s.is_probono ? (
                                                                            <span style={{ backgroundColor: '#db2777', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold' }}>Pro-Bono</span>
                                                                        ) : formatCurrency(fullTotal)}
                                                                    </td>
                                                                    <td>
                                                                        <span className={`status-badge status-${s.status}`}>
                                                                            {s.status}
                                                                        </span>
                                                                    </td>
                                                                    <td>
                                                                        <div className="actions-cell">
                                                                            <button className="btn-icon btn-edit" title="Edit" onClick={() => handleEdit(s)}>
                                                                                <Edit size={16} />
                                                                            </button>
                                                                            <button className="btn-icon btn-notes" title="Notes" onClick={() => handleNotes(s)}>
                                                                                <MessageSquare size={16} />
                                                                            </button>
                                                                            {s.status !== 'completed' && s.status !== 'cancelled' && (
                                                                                <>
                                                                                    <button className="btn-icon btn-reschedule" title="Complete" onClick={() => handleCompleteSurgery(s.id)}>
                                                                                        <Check size={12} />
                                                                                    </button>
                                                                                    <button className="btn-icon btn-action-cancel" title="Cancel" onClick={() => handleCancelSurgery(s.id)}>
                                                                                        <AlertCircle size={12} />
                                                                                    </button>
                                                                                </>
                                                                            )}
                                                                            <button className="btn-icon btn-delete" title="Delete" onClick={() => handleDeleteSurgery(s.id)}>
                                                                                <Trash2 size={12} />
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>

                                                {/* Pagination controls */}
                                                {totalPages > 1 && (
                                                    <div className="pagination-controls">
                                                        <span>Page {currentPage} of {totalPages}</span>
                                                        <div style={{ display: 'flex', gap: '4px' }}>
                                                            <button
                                                                className="page-btn"
                                                                disabled={currentPage === 1}
                                                                onClick={() => setMonthPages({ ...monthPages, [monthKey]: currentPage - 1 })}
                                                            >
                                                                Prev
                                                            </button>
                                                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(num => (
                                                                <button
                                                                    key={num}
                                                                    className={`page-num ${num === currentPage ? 'active' : ''}`}
                                                                    onClick={() => setMonthPages({ ...monthPages, [monthKey]: num })}
                                                                >
                                                                    {num}
                                                                </button>
                                                            ))}
                                                            <button
                                                                className="page-btn"
                                                                disabled={currentPage === totalPages}
                                                                onClick={() => setMonthPages({ ...monthPages, [monthKey]: currentPage + 1 })}
                                                            >
                                                                Next
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default SurgeryScheduler;
