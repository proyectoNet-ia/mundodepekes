
import React, { useState, useEffect, useCallback } from 'react';
import styles from './Records.module.css';
import { supabase } from '../../lib/supabase';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faUser, faChild, faEllipsisV, faTimes, faTicket, faChevronLeft, faChevronRight, faLock, faPlus, faTrash, faEdit } from '@fortawesome/free-solid-svg-icons';
import { useToast } from '../../components/Toast';

// Capitaliza nombres propios respetando preposiciones en español
const LOWERCASE_WORDS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'o', 'a', 'en']);
const toTitleCase = (str: string): string => {
    return str
        .toLowerCase()
        .split(' ')
        .map((word, index) => {
            if (!word) return word;
            if (index !== 0 && LOWERCASE_WORDS.has(word)) return word;
            return word.split('-').map(part =>
                part.charAt(0).toUpperCase() + part.slice(1)
            ).join('-');
        })
        .join(' ');
};

interface RecordData {
    id: string;
    name: string;
    type: 'child' | 'tutor';
    subtext: string;
    details: string;
    visits?: number;
    isBlacklisted?: boolean;
    tutorName?: string;
    tutorPhone?: string;
}

interface RecordsProps {
    onEntry?: (child: any) => void;
}

const PAGE_SIZE = 25;

const formatPhone = (phone: string) => {
    if (!phone) return '';
    const clean = phone.replace(/\D/g, '');
    if (clean.length === 10) {
        return `(${clean.substring(0, 3)}) ${clean.substring(3, 6)}-${clean.substring(6)}`;
    }
    return phone;
};

export const Records: React.FC<RecordsProps> = ({ onEntry }) => {
    const { showToast } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [filter, setFilter]   = useState<'all' | 'children' | 'tutors'>('all');
    const [data, setData]       = useState<RecordData[]>([]);
    const [total, setTotal]     = useState(0);
    const [page, setPage]       = useState(1);
    
    // UI states
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const [menuPos, setMenuPos]       = useState<{ top: number; right: number }>({ top: 0, right: 0 });

    // Edit states
    const [editItem, setEditItem]   = useState<RecordData | null>(null);
    const [editName, setEditName]   = useState('');
    const [editPhones, setEditPhones] = useState<string[]>([]);
    const [editPrefixes, setEditPrefixes] = useState<string[]>([]);
    const [isSaving, setIsSaving]   = useState(false);

    // PIN modal (removed unused)

    useEffect(() => {
        const t = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setPage(1);
        }, 350);
        return () => clearTimeout(t);
    }, [searchTerm]);

    const fetchData = useCallback(async () => {
        try {
            const isSearching = debouncedSearch.trim().length > 0;
            let results: RecordData[] = [];
            
            if (filter === 'all' || filter === 'tutors') {
                let q = supabase.from('clientes').select('*', { count: 'exact' });
                if (isSearching) q = q.ilike('nombre', `%${debouncedSearch}%`);
                
                const { data: clients, count } = await q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1).order('nombre');
                if (clients) {
                    results = [...results, ...clients.map(c => ({
                        id: c.id,
                        name: c.nombre,
                        type: 'tutor' as const,
                        subtext: 'Tutor / Responsable',
                        details: c.telefono || 'Sin teléfono',
                        tutorPhone: c.telefono,
                        isBlacklisted: false
                    }))];
                    if (filter === 'tutors') setTotal(count || 0);
                }
            }

            if (filter === 'all' || filter === 'children') {
                let q = supabase.from('ninos').select('*, clientes(nombre, telefono)', { count: 'exact' });
                if (isSearching) q = q.ilike('nombre', `%${debouncedSearch}%`);
                
                const { data: children, count } = await q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1).order('nombre');
                if (children) {
                    results = [...results, ...children.map(c => ({
                        id: c.id,
                        name: c.nombre,
                        type: 'child' as const,
                        subtext: `Niño(a) · ${c.edad} años`,
                        details: `Tutor: ${c.clientes?.nombre || 'Desconocido'}`,
                        isBlacklisted: !!c.en_lista_negra,
                        tutorPhone: c.clientes?.telefono
                    }))];
                    if (filter === 'children') setTotal(count || 0);
                }
            }

            if (filter === 'all') setTotal(results.length);
            setData(results);
        } catch (err) {
            showToast('Error al cargar datos', 'error');
        } finally {
            // Loading handled internally
        }
    }, [debouncedSearch, filter, page]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleEditClick = (item: RecordData) => {
        setEditItem(item);
        setEditName(item.name);
        
        if (item.type === 'tutor') {
            const rawPhones = item.tutorPhone ? item.tutorPhone.split(',').map(p => p.trim()) : [];
            const locals: string[] = [];
            const prefixes: string[] = [];

            rawPhones.forEach(full => {
                const d = full.replace(/\D/g, '');
                if (full.startsWith('+')) {
                    if (d.startsWith('52') && d.length === 12) {
                        prefixes.push('+52');
                        locals.push(d.substring(2));
                    } else if (d.length > 10) {
                        prefixes.push(`+${d.substring(0, d.length - 10)}`);
                        locals.push(d.substring(d.length - 10));
                    } else {
                        prefixes.push('+52');
                        locals.push(d);
                    }
                } else if (d.length === 10) {
                    prefixes.push('+52');
                    locals.push(d);
                } else {
                    prefixes.push('+52');
                    locals.push(d);
                }
            });

            setEditPhones(locals.length > 0 ? locals : ['']);
            setEditPrefixes(prefixes.length > 0 ? prefixes : ['+52']);
        }
        setMenuOpenId(null);
    };

    const handleSaveEdit = async () => {
        if (!editItem) return;
        setIsSaving(true);
        try {
            if (editItem.type === 'child') {
                await supabase.from('ninos').update({ nombre: editName }).eq('id', editItem.id);
            } else {
                const fullPhones = editPhones.map((p, idx) => {
                    if (!p) return null;
                    const pref = editPrefixes[idx] || '+52';
                    return `${pref}${p.replace(/\D/g, '')}`;
                }).filter(Boolean).join(', ');

                await supabase.from('clientes').update({ nombre: editName, telefono: fullPhones }).eq('id', editItem.id);
            }
            setEditItem(null);
            fetchData();
            showToast('Cambios guardados', 'success');
        } catch (err) {
            showToast('Error al guardar', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleMenu = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
        if (menuOpenId === id) { setMenuOpenId(null); return; }
        const rect = e.currentTarget.getBoundingClientRect();
        setMenuPos({ top: rect.bottom + window.scrollY, right: window.innerWidth - rect.right });
        setMenuOpenId(id);
    };

    const handleTutorEntry = async (tutor: RecordData) => {
        try {
            const { data: children } = await supabase.from('ninos').select('*').eq('tutor_id', tutor.id);
            if (children && onEntry) {
                onEntry({ registeredChildren: children, tutorId: tutor.id, tutorName: tutor.name });
            }
        } catch (err) {
            showToast('Error al buscar niños', 'error');
        } finally {
            // Loading handled internally
        }
    };

    return (
        <div className={styles.recordsContainer}>
            <header className={styles.header}>
                <h1 className={styles.title}>Registros del Sistema</h1>
                <span className={styles.countBadge}>{total} registros</span>
            </header>

            <div className={styles.searchBar}>
                <FontAwesomeIcon icon={faSearch} className={styles.searchIcon} />
                <input
                    type="text"
                    placeholder="Buscar por nombre..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={styles.searchInput}
                />
            </div>

            <div className={styles.filterTabs}>
                {(['all', 'children', 'tutors'] as const).map(f => (
                    <button key={f} className={`${styles.filterTab} ${filter === f ? styles.activeTab : ''}`} onClick={() => setFilter(f)}>
                        {f === 'all' ? 'Todos' : f === 'children' ? 'Niños' : 'Tutores'}
                    </button>
                ))}
            </div>

            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>Tipo</th>
                            <th>Detalles</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map(item => (
                            <tr key={`${item.type}-${item.id}`}>
                                <td data-label="Nombre">
                                    <div className={styles.nameCell}>
                                        <div className={`${styles.avatar} ${item.type === 'child' ? styles.childAvatar : styles.tutorAvatar}`}>
                                            <FontAwesomeIcon icon={item.type === 'child' ? faChild : faUser} />
                                        </div>
                                        <span className={styles.mainName}>{item.name}</span>
                                    </div>
                                </td>
                                <td data-label="Tipo">
                                    <span className={`${styles.badge} ${item.type === 'child' ? styles.childBadge : styles.tutorBadge}`}>
                                        {item.type === 'child' ? 'Niño' : 'Tutor'}
                                    </span>
                                </td>
                                <td data-label="Detalles" className={styles.detailsCell}>{item.details}</td>
                                <td data-label="Acciones">
                                    <div className={styles.actionGroup}>
                                        <button 
                                            className={`btn ${item.isBlacklisted ? 'btn-danger' : 'btn-primary'}`}
                                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderRadius: '8px' }}
                                            onClick={() => item.type === 'child' ? (onEntry && onEntry(item)) : handleTutorEntry(item)}
                                        >
                                            <FontAwesomeIcon icon={item.isBlacklisted ? faLock : faTicket} /> Ingreso
                                        </button>
                                        <div style={{ position: 'relative' }}>
                                            <button className={styles.actionBtn} onClick={(e) => toggleMenu(e, item.id)}>
                                                <FontAwesomeIcon icon={faEllipsisV} />
                                            </button>
                                            {menuOpenId === item.id && (
                                                <div className={styles.contextMenu} style={{ top: menuPos.top - window.scrollY, right: menuPos.right }}>
                                                    <button className={styles.menuItem} onClick={() => handleEditClick(item)}>
                                                        <FontAwesomeIcon icon={faEdit} /> Editar
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {!debouncedSearch && (
                <div className={styles.pagination}>
                    <button className={styles.pageBtn} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                        <FontAwesomeIcon icon={faChevronLeft} />
                    </button>
                    <span className={styles.pageInfo}>Página {page}</span>
                    <button className={styles.pageBtn} onClick={() => setPage(p => p + 1)} disabled={data.length < PAGE_SIZE}>
                        <FontAwesomeIcon icon={faChevronRight} />
                    </button>
                </div>
            )}

            {/* Modal de Edición */}
            {editItem && (
                <div className={styles.modalOverlay}>
                    <div className={styles.editModal}>
                        <div className={styles.editModalHeader}>
                            <h3>Editar {editItem.type === 'child' ? 'Niño' : 'Tutor'}</h3>
                            <button onClick={() => setEditItem(null)} className={styles.closeBtn}><FontAwesomeIcon icon={faTimes} /></button>
                        </div>
                        <div className={styles.editModalBody}>
                            <div className={styles.field}>
                                <label>Nombre Completo</label>
                                <input className={styles.editInput} value={editName} onChange={e => setEditName(toTitleCase(e.target.value))} />
                            </div>
                            
                            {editItem.type === 'tutor' && (
                                <div className={styles.phonesSection}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center' }}>
                                        <label>Teléfonos de Contacto</label>
                                        <button onClick={() => { setEditPhones([...editPhones, '']); setEditPrefixes([...editPrefixes, '+52']); }} className={styles.addBtn}>
                                            <FontAwesomeIcon icon={faPlus} /> Añadir
                                        </button>
                                    </div>
                                    {editPhones.map((phone, idx) => (
                                        <div key={idx} className={styles.phoneRow} style={{ display: 'flex', gap: '8px', marginBottom: '10px', background: '#f8fafc', padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ width: '80px' }}>
                                                <small style={{ display: 'block', fontSize: '0.6rem', fontWeight: 800, color: 'var(--brand-600)' }}>LADA</small>
                                                <input 
                                                    type="text" 
                                                    value={editPrefixes[idx] || '+52'} 
                                                    onChange={e => { const up = [...editPrefixes]; up[idx] = e.target.value; setEditPrefixes(up); }} 
                                                    style={{ width: '100%', textAlign: 'center', fontWeight: 'bold', border: '2px solid var(--brand-100)', borderRadius: '8px', padding: '6px' }}
                                                />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <small style={{ display: 'block', fontSize: '0.6rem', fontWeight: 800, color: '#64748b' }}>TELÉFONO (10 DÍGITOS)</small>
                                                <input 
                                                    type="tel" 
                                                    value={formatPhone(phone)} 
                                                    onChange={e => { const up = [...editPhones]; up[idx] = e.target.value.replace(/\D/g, '').substring(0, 10); setEditPhones(up); }} 
                                                    style={{ width: '100%', border: '2px solid #cbd5e1', borderRadius: '8px', padding: '6px' }}
                                                    placeholder="000 000 0000"
                                                />
                                            </div>
                                            <button onClick={() => { setEditPhones(editPhones.filter((_, i) => i !== idx)); setEditPrefixes(editPrefixes.filter((_, i) => i !== idx)); }} className={styles.delBtn} style={{ marginTop: '12px' }}>
                                                <FontAwesomeIcon icon={faTrash} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className={styles.editModalFooter}>
                            <button className="btn btn-ghost" onClick={() => setEditItem(null)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleSaveEdit} disabled={isSaving}>
                                {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
