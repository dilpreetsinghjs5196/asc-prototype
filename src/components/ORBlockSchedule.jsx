import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, Edit2, Trash2, Loader2 } from 'lucide-react';
import { db } from '../lib/supabase';
import './ORBlockSchedule.css';

const mapDBToBlock = (dbBlock) => {
  const formatTime = (t) => t ? (t.length > 5 ? t.substring(0, 5) : t) : '';
  const start = formatTime(dbBlock.start_time);
  const end = formatTime(dbBlock.end_time);
  return {
    id: dbBlock.id,
    dateStr: dbBlock.date,
    or: dbBlock.room_name,
    surgeon: dbBlock.provider_name,
    type: (start && end) ? `${start} - ${end}` : 'Full Day Block (Untimed)'
  };
};

const ORBlockSchedule = ({ activeFacility }) => {
  // Use a dynamic Date object initialized to the 1st day of the current month
  const [currentMonthDate, setCurrentMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  
  const [blocks, setBlocks] = useState([]);
  const [surgeonsList, setSurgeonsList] = useState([]);
  const [surgeonsData, setSurgeonsData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const targetFac = activeFacility?.id || db.getActiveFacility()?.id;
        const [blocksData, surgeonsData] = await Promise.all([
          db.getORBlockSchedule(targetFac),
          db.getSurgeons(targetFac)
        ]);
        setBlocks(blocksData.map(mapDBToBlock));
        setSurgeonsData(surgeonsData);
        setSurgeonsList(surgeonsData.map(s => `${s.firstname} ${s.lastname}`.trim()));
      } catch (err) {
        console.error("Failed to fetch schedule data:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [activeFacility?.id]);

  const allActiveBlocks = useMemo(() => {
    const dynamicBlocks = [];
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    
    const dayNameToIndex = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };
    const weekToMultiplier = { 'First': 0, 'Second': 1, 'Third': 2, 'Fourth': 3, 'Fifth': 4 };
    
    surgeonsData.forEach(surgeon => {
      if (!surgeon.block_templates) return;
      surgeon.block_templates.forEach((template, tIdx) => {
        if (template.week === 'Specific Date') {
          dynamicBlocks.push({
            id: `template-${surgeon.id}-${tIdx}`,
            dateStr: template.day,
            or: template.room,
            surgeon: `${surgeon.firstname} ${surgeon.lastname}`.trim(),
            type: (template.startTime && template.endTime) ? `${template.startTime} - ${template.endTime}` : 'Full Day Block (Untimed)',
            isTemplate: true
          });
        } else {
          const targetDay = dayNameToIndex[template.day];
          if (targetDay !== undefined) {
            const firstDayOfMonth = new Date(year, month, 1).getDay();
            let offset = targetDay - firstDayOfMonth;
            if (offset < 0) offset += 7;
            const dayOfMonth = 1 + offset + (weekToMultiplier[template.week] * 7);
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            if (dayOfMonth <= daysInMonth) {
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;
              dynamicBlocks.push({
                id: `template-${surgeon.id}-${tIdx}-${dateStr}`,
                dateStr: dateStr,
                or: template.room,
                surgeon: `${surgeon.firstname} ${surgeon.lastname}`.trim(),
                type: (template.startTime && template.endTime) ? `${template.startTime} - ${template.endTime}` : 'Full Day Block (Untimed)',
                isTemplate: true
              });
            }
          }
        }
      });
    });
    
    return [...blocks, ...dynamicBlocks];
  }, [blocks, surgeonsData, currentMonthDate]);

  // Dynamic Calendar Engine
  const calendarLayout = useMemo(() => {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    const monthName = currentMonthDate.toLocaleString('default', { month: 'short' }).toUpperCase();
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const dayGroupsMap = {
      'MONDAYS': [],
      'TUESDAYS': [],
      'WEDNESDAYS': [],
      'THURSDAYS': [],
      'FRIDAYS': []
    };

    const dayNames = ['SUNDAYS', 'MONDAYS', 'TUESDAYS', 'WEDNESDAYS', 'THURSDAYS', 'FRIDAYS', 'SATURDAYS'];

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dayOfWeek = date.getDay(); // 0 is Sunday, 6 is Saturday
      
      // Only include Monday-Friday
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        const groupName = dayNames[dayOfWeek];
        const weekStr = `WEEK ${dayGroupsMap[groupName].length + 1}`;
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        
        dayGroupsMap[groupName].push({
          dateStr,
          month: monthName,
          day: d,
          week: weekStr
        });
      }
    }

    // Convert map to array and only return days that actually exist in this month
    return Object.keys(dayGroupsMap).map(key => ({
      dayGroup: key,
      weeks: dayGroupsMap[key]
    })).filter(g => g.weeks.length > 0);
  }, [currentMonthDate]);

  const handlePrevMonth = () => {
    setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1));
  };



  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('list'); // 'list' or 'add'
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedOR, setSelectedOR] = useState('OR 1');

  // Form State
  const [newSurgeon, setNewSurgeon] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [editingBlockId, setEditingBlockId] = useState(null);

  const openModal = (dateStr, orRoom) => {
    setSelectedDate(dateStr);
    setSelectedOR(orRoom);
    setModalMode('list');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setNewSurgeon('');
    setNewStart('');
    setNewEnd('');
    setEditingBlockId(null);
  };

  const handleEditOpen = (block) => {
    setEditingBlockId(block.id);
    setNewSurgeon(block.surgeon);
    
    let start = '';
    let end = '';
    if (block.type && block.type.includes(' - ')) {
      const parts = block.type.split(' - ');
      if (parts.length === 2) {
        start = parts[0].trim();
        end = parts[1].trim();
      }
    }
    
    setNewStart(start);
    setNewEnd(end);
    setModalMode('add');
  };

  const handleDelete = async (id) => {
    try {
      await db.deleteORBlockSchedule(id);
      setBlocks(blocks.filter(b => b.id !== id));
    } catch (err) {
      console.error("Failed to delete block:", err);
      alert("Failed to delete block. Please check your permissions.");
    }
  };

  const handleAddSubmit = async () => {
    if (!newSurgeon) return;
    
    try {
      const schedule = {
        date: selectedDate,
        room_name: selectedOR,
        provider_name: newSurgeon,
        start_time: newStart || null,
        end_time: newEnd || null
      };
      
      if (editingBlockId) {
        const updatedDbBlock = await db.updateORBlockSchedule(editingBlockId, schedule);
        if (updatedDbBlock) {
          setBlocks(blocks.map(b => b.id === editingBlockId ? mapDBToBlock(updatedDbBlock) : b));
        }
      } else {
        const newDbBlock = await db.addORBlockSchedule(schedule);
        if (newDbBlock) {
          setBlocks([...blocks, mapDBToBlock(newDbBlock)]);
        }
      }
      
      setModalMode('list');
      setNewSurgeon('');
      setNewStart('');
      setNewEnd('');
      setEditingBlockId(null);
    } catch (err) {
      console.error("Failed to save block:", err);
      alert("Failed to save block. Please check your permissions.");
    }
  };

  const selectedDateBlocks = allActiveBlocks.filter(b => b.dateStr === selectedDate && b.or === selectedOR);

  return (
    <div className="or-block-container">
      {/* Header */}
      <div className="or-block-header-top">
        <div className="or-block-title-section">
          <h1>OR Block Schedule</h1>
          <div className="or-block-stats">
            <span className="stat-badge">Total Blocks: {allActiveBlocks.length}</span>
            <span className="stat-badge">Daily Pie chart</span>
          </div>
        </div>

        <div className="month-navigator">
          <button className="nav-btn" onClick={handlePrevMonth}>
            <ChevronLeft size={18} />
          </button>
          <span className="month-label">
            {currentMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </span>
          <button className="nav-btn" onClick={handleNextMonth}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="or-schedule-table">
        {isLoading ? (
          <div style={{ padding: '3rem', display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#94a3b8' }}>
            <Loader2 className="animate-spin" size={32} style={{ marginBottom: '1rem' }} />
            <span>Loading schedule from database...</span>
          </div>
        ) : (
          <>
            <div className="table-header">
              <div className="th-cell">Date</div>
              <div className="th-cell">OR 1</div>
            </div>

            {/* Day Groups */}
            {calendarLayout.map((dayData, index) => (
              <div key={index} className="day-group">
                <div className="day-title">{dayData.dayGroup}</div>
                
                {/* Week Rows */}
                {dayData.weeks.map((weekData, wIndex) => {
                  const dateStr = weekData.dateStr;
                  const or1Blocks = allActiveBlocks.filter(b => b.dateStr === dateStr && b.or === 'OR 1');
                  
                  return (
                    <div key={wIndex} className="week-row" onClick={() => openModal(weekData.dateStr, 'OR 1')}>
                      {/* Date Cell */}
                      <div className="date-cell">
                        <span className="date-month">{weekData.month}</span>
                        <span className="date-day">{weekData.day}</span>
                        <span className="date-week">{weekData.week}</span>
                      </div>
                      
                      {/* Blocks Cell */}
                      <div className="blocks-cell">
                        {or1Blocks.map(block => (
                          <div key={block.id} className="block-card">
                            <span className="surgeon-name">{block.surgeon}</span>
                            <span className="block-time">{block.type}</span>
                          </div>
                        ))}
                        {or1Blocks.length === 0 && (
                          <div className="empty-block-state">+ Click to add blocks</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        )}
      </div>

      {/* MODAL */}
      {isModalOpen && (
        <div className="or-modal-overlay">
          <div className="or-modal-content">
            <div className="or-modal-header">
              <h2>{selectedDate} - {selectedOR}</h2>
              <button className="close-btn" onClick={closeModal}><X size={18} /></button>
            </div>

            {modalMode === 'list' ? (
              <div className="or-modal-body-list">
                {selectedDateBlocks.length > 0 ? (
                  <div className="modal-block-list">
                    {selectedDateBlocks.map(b => (
                      <div key={b.id} className="modal-block-item">
                        <div className="modal-block-info">
                          <span className="modal-surgeon-name">{b.surgeon}</span>
                          <span className="modal-block-type">{b.type}</span>
                        </div>
                        <div className="modal-block-actions">
                          {!b.isTemplate && (
                            <>
                              <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleEditOpen(b); }} title="Edit Block">
                                <Edit2 size={16} />
                              </button>
                              <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleDelete(b.id); }} title="Delete Block">
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="no-blocks-msg">No blocks scheduled for this date.</div>
                )}
                
                <button className="add-block-dashed-btn" onClick={() => setModalMode('add')}>
                  + Add Surgeon Block
                </button>
              </div>
            ) : (
              <div className="or-modal-body-form">
                <div className="form-group">
                  <label>Surgeon / Provider</label>
                  <select value={newSurgeon} onChange={(e) => setNewSurgeon(e.target.value)} className="form-control">
                    <option value="">Select Surgeon</option>
                    {surgeonsList.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label>Start Time</label>
                    <div className="time-input-wrapper">
                      <input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="form-control" />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>End Time</label>
                    <div className="time-input-wrapper">
                      <input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="form-control" />
                    </div>
                  </div>
                </div>

                <div className="modal-footer-actions">
                  <button className="btn-back" onClick={() => { setModalMode('list'); setEditingBlockId(null); setNewSurgeon(''); setNewStart(''); setNewEnd(''); }}>Back</button>
                  <button className="btn-primary" onClick={handleAddSubmit}>
                    {editingBlockId ? 'Save Changes' : 'Add Block'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ORBlockSchedule;
