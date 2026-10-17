import React, { useState, useEffect } from 'react';
import { supabase, db } from '../lib/supabase';
import { Search, Edit, Trash2, Save, Plus, Building2 } from 'lucide-react';
import './InstructionPanel.css';

export default function InstructionPanel({ activeFacility, facilities = [], isSuperAdmin: propIsSuperAdmin }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  
  // Super Admin & Facilities
  const session = db.getSession();
  const isSuperAdmin = propIsSuperAdmin !== undefined ? propIsSuperAdmin : (session?.role === 'super_admin');
  const [facilitiesList, setFacilitiesList] = useState(facilities || []);

  useEffect(() => {
    if (facilities && facilities.length > 0) {
      setFacilitiesList(facilities);
    } else {
      db.getFacilities().then(res => {
        if (res && res.length > 0) setFacilitiesList(res);
      }).catch(console.error);
    }
  }, [facilities]);

  // Form state
  const [formData, setFormData] = useState({
    question: '',
    category: '',
    is_active: true,
    facility_id: activeFacility?.id || ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit state
  const [editingQuestion, setEditingQuestion] = useState(null);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      const targetFac = activeFacility?.id || db.getActiveFacility()?.id;
      const data = await db.getChatbotQuestions(targetFac);
      setQuestions(data || []);
    } catch (error) {
      console.error('Error fetching questions:', error);
      // Fallback for UI if DB fails, or just set empty
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions();
    if (activeFacility?.id) {
      setFormData(prev => ({ ...prev, facility_id: prev.facility_id || activeFacility.id }));
    }
  }, [activeFacility?.id]);

  const handleSaveQuestion = async (e) => {
    e.preventDefault();
    if (!formData.question || !formData.category) return;
    
    try {
      setIsSubmitting(true);
      const targetFac = formData.facility_id || activeFacility?.id || db.getActiveFacility()?.id;
      
      const newQuestion = await db.addChatbotQuestion({
        question: formData.question,
        category: formData.category,
        is_active: formData.is_active,
        facility_id: targetFac
      });
      
      // Update local state
      if (newQuestion) {
        setQuestions(prev => [...prev, newQuestion]);
      }
      
      // Reset form
      setFormData({
        question: '',
        category: '',
        is_active: true,
        facility_id: activeFacility?.id || (facilitiesList[0]?.id || '')
      });
      
    } catch (error) {
      console.error('Error adding question:', error);
      alert('Failed to save question. See console for details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this question?')) return;
    
    try {
      const { error } = await supabase
        .from('chatbot_questions')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      
      setQuestions(questions.filter(q => q.id !== id));
    } catch (error) {
      console.error('Error deleting question:', error);
      alert('Failed to delete question.');
    }
  };

  const handleUpdateQuestion = async (e) => {
    e.preventDefault();
    if (!editingQuestion || !editingQuestion.question || !editingQuestion.category) return;
    
    try {
      setIsSubmitting(true);
      const updatePayload = {
        question: editingQuestion.question,
        category: editingQuestion.category,
        is_active: editingQuestion.is_active
      };
      if (editingQuestion.facility_id) {
        updatePayload.facility_id = editingQuestion.facility_id;
      }
      const { data, error } = await supabase
        .from('chatbot_questions')
        .update(updatePayload)
        .eq('id', editingQuestion.id)
        .select();
        
      if (error) throw error;
      
      // Update local state
      setQuestions(questions.map(q => q.id === editingQuestion.id ? (data ? data[0] : editingQuestion) : q));
      setEditingQuestion(null);
      
    } catch (error) {
      console.error('Error updating question:', error);
      alert('Failed to update question.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter and search
  const filteredQuestions = questions.filter(q => {
    const matchesSearch = q.question.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'All' || q.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Extract unique categories for filter
  const categories = ['All', ...new Set(questions.map(q => q.category))];

  return (
    <div className="instruction-panel-container">
      {/* Top Form Section */}
      <div className="instruction-card">
        <div className="card-header-ip">
          <h3 className="card-title-ip">
            <Plus size={20} /> Add New Chatbot Question
          </h3>
        </div>
        
        <form onSubmit={handleSaveQuestion}>
          {isSuperAdmin && (
            <div style={{
              margin: '0 0 16px 0',
              padding: '12px 14px',
              background: 'rgba(59, 130, 246, 0.06)',
              borderRadius: '8px',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <label style={{
                fontSize: '0.78rem',
                fontWeight: '700',
                color: 'var(--color-blue, #3b82f6)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <Building2 size={14} /> Assign Facility (Super Admin)
              </label>
              <select
                value={formData.facility_id || activeFacility?.id || ''}
                onChange={(e) => setFormData({ ...formData, facility_id: e.target.value })}
                className="ip-input"
                style={{ width: '100%', background: 'var(--bg-card, #1e293b)', color: 'var(--text-primary, #fff)', fontWeight: '600' }}
              >
                <option value="">Select Facility...</option>
                {facilitiesList.map(f => (
                  <option key={f.id} value={f.id}>{f.name} ({f.location || f.code})</option>
                ))}
              </select>
            </div>
          )}
          <div className="ip-form-grid">
            <div className="ip-form-group">
              <label className="ip-label">Enter the question...</label>
              <input 
                type="text" 
                className="ip-input" 
                placeholder="e.g. Who is this month's top performing surgeon?"
                value={formData.question}
                onChange={(e) => setFormData({...formData, question: e.target.value})}
                required
              />
            </div>
            
            <div className="ip-form-group">
              <label className="ip-label">Category</label>
              <input 
                type="text" 
                className="ip-input" 
                placeholder="e.g. Billing, Surgery, General"
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
                required
              />
            </div>
            
            <div style={{ display: 'flex', gap: '16px' }}>
              <div className="ip-checkbox-group">
                <input 
                  type="checkbox" 
                  id="isActive"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                />
                <label htmlFor="isActive" className="ip-label" style={{ cursor: 'pointer' }}>Active</label>
              </div>
              
              <button type="submit" className="ip-btn-save" disabled={isSubmitting}>
                <Save size={16} /> {isSubmitting ? 'Saving...' : 'Save Question'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* List Section */}
      <div className="instruction-card">
        <div className="card-header-ip" style={{ marginBottom: '16px' }}>
          <div>
            <h3 className="card-title-ip">Question List</h3>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {questions.length} questions registered
            </span>
          </div>
          
          <div style={{ display: 'flex', gap: '12px' }}>
            <div className="ip-search-bar">
              <Search size={16} color="var(--text-secondary)" />
              <input 
                type="text" 
                className="ip-search-input" 
                placeholder="Search questions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <select 
              className="ip-input" 
              style={{ width: '150px' }}
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="ip-table-container">
          <table className="ip-table">
            <thead>
              <tr>
                <th style={{ width: '50%' }}>QUESTION</th>
                <th style={{ width: '20%' }}>CATEGORY</th>
                <th style={{ width: '15%' }}>STATUS</th>
                <th style={{ width: '15%' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '40px' }}>Loading questions...</td>
                </tr>
              ) : filteredQuestions.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                    No questions found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredQuestions.map((q) => (
                  <tr key={q.id}>
                    <td style={{ fontWeight: '500' }}>{q.question}</td>
                    <td>
                      <span className="ip-badge ip-badge-category">{q.category}</span>
                    </td>
                    <td>
                      <span className={`ip-badge ${q.is_active ? 'ip-badge-active' : 'ip-badge-inactive'}`}>
                        {q.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="ip-actions">
                        <button className="ip-action-btn" onClick={() => setEditingQuestion(q)} title="Edit">
                          <Edit size={14} />
                        </button>
                        <button className="ip-action-btn delete" onClick={() => handleDelete(q.id)} title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingQuestion && (
        <div className="ip-modal-overlay" onClick={() => setEditingQuestion(null)}>
          <div className="ip-modal" onClick={e => e.stopPropagation()}>
            <h3 className="card-title-ip" style={{ marginBottom: '20px' }}>Edit Question</h3>
            <form onSubmit={handleUpdateQuestion}>
              {isSuperAdmin && (
                <div className="ip-form-group" style={{ marginBottom: '16px' }}>
                  <label className="ip-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Building2 size={14} /> Assign Facility (Super Admin)
                  </label>
                  <select
                    className="ip-input"
                    value={editingQuestion.facility_id || activeFacility?.id || ''}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, facility_id: e.target.value })}
                  >
                    <option value="">Select Facility...</option>
                    {facilitiesList.map(f => (
                      <option key={f.id} value={f.id}>{f.name} ({f.location || f.code})</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="ip-form-group" style={{ marginBottom: '16px' }}>
                <label className="ip-label">Question</label>
                <input 
                  type="text" 
                  className="ip-input" 
                  value={editingQuestion.question}
                  onChange={(e) => setEditingQuestion({...editingQuestion, question: e.target.value})}
                  required
                />
              </div>
              <div className="ip-form-group" style={{ marginBottom: '16px' }}>
                <label className="ip-label">Category</label>
                <input 
                  type="text" 
                  className="ip-input" 
                  value={editingQuestion.category}
                  onChange={(e) => setEditingQuestion({...editingQuestion, category: e.target.value})}
                  required
                />
              </div>
              <div className="ip-checkbox-group" style={{ marginTop: '0', marginBottom: '20px' }}>
                <input 
                  type="checkbox" 
                  id="editIsActive"
                  checked={editingQuestion.is_active}
                  onChange={(e) => setEditingQuestion({...editingQuestion, is_active: e.target.checked})}
                />
                <label htmlFor="editIsActive" className="ip-label" style={{ cursor: 'pointer' }}>Active</label>
              </div>
              
              <div className="ip-modal-actions">
                <button 
                  type="button" 
                  className="btn-header" 
                  onClick={() => setEditingQuestion(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="ip-btn-save" style={{ marginTop: 0 }} disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
