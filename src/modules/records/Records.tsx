
import React, { useState, useEffect, useCallback } from 'react';
import styles from './Records.module.css';
import { supabase } from '../../lib/supabase';
import { getActiveSessions } from '../../lib/sessionService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faUser, faChild, faEllipsisV, faTimes, faTicket, faChevronLeft, faChevronRight, faLock, faPlus, faTrash, faEdit, faUserSlash, faCheckCircle, faPhone, faUserPlus } from '@fortawesome/free-solid-svg-icons';
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
    observations?: string;
    tutorName?: string;
    tutorPhone?: string;
    allKidsActive?: boolean;
}

interface RecordsProps {
    onEntry?: (child: any) => void;
}

const PAGE_SIZE = 25;

const formatPhone = (phone: string) => {
    if (!phone) return '';
    let digits = phone.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('52')) digits = digits.substring(2);
    if (digits.length === 11 && digits.startsWith('1')) digits = digits.substring(1);
    digits = digits.substring(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.substring(0, 3)}) ${digits.substring(3)}`;
    return `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6, 10)}`;
};

const formatDisplayPhone = (rawPhone: string): string => {
    if (!rawPhone) return '';
    if (rawPhone.includes(',')) {
        return rawPhone
            .split(',')
            .map(p => formatDisplayPhone(p.trim()))
            .filter(Boolean)
            .join(', ');
    }

    const digits = rawPhone.replace(/\D/g, '');
    if (!digits) return rawPhone;

    // Caso de doble LADA de México (ej. 52523521645089 -> 14 dígitos)
    if (digits.startsWith('5252') && digits.length === 14) {
        const phone = digits.substring(4);
        return `+52 (${phone.substring(0, 3)}) ${phone.substring(3, 6)}-${phone.substring(6)}`;
    }

    // Caso de LADA México normal (ej. 523521253235 -> 12 dígitos)
    if (digits.startsWith('52') && digits.length === 12) {
        const phone = digits.substring(2);
        return `+52 (${phone.substring(0, 3)}) ${phone.substring(3, 6)}-${phone.substring(6)}`;
    }

    // Caso de LADA US normal (ej. 13521253235 -> 11 dígitos)
    if (digits.startsWith('1') && digits.length === 11) {
        const phone = digits.substring(1);
        return `+1 (${phone.substring(0, 3)}) ${phone.substring(3, 6)}-${phone.substring(6)}`;
    }

    if (digits.length === 10) {
        return `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}`;
    }

    return rawPhone;
};

const formatPrefix = (val: string): string => {
    if (!val) return '';
    let clean = val.replace(/[^\d+]/g, '');
    if (!clean.startsWith('+')) {
        clean = '+' + clean.replace(/\+/g, '');
    } else {
        clean = '+' + clean.slice(1).replace(/\+/g, '');
    }
    return clean.substring(0, 3);
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
    const [editObservations, setEditObservations] = useState('');
    const [editBlacklisted, setEditBlacklisted]   = useState(false);
    const [editPhones, setEditPhones] = useState<string[]>([]);
    const [editPrefixes, setEditPrefixes] = useState<string[]>([]);
    const [isSaving, setIsSaving]   = useState(false);
    const [activeChildIds, setActiveChildIds] = useState<Set<string>>(new Set());

    // New Registration states
    const [showRegistrationModal, setShowRegistrationModal] = useState(false);
    const [regTutorName, setRegTutorName] = useState('');
    const [regTutorPhone, setRegTutorPhone] = useState('');
    const [regNinos, setRegNinos] = useState<{ nombre: string; edad: number }[]>([{ nombre: '', edad: 0 }]);
    const [isRegistering, setIsRegistering] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setPage(1);
        }, 350);
        return () => clearTimeout(t);
    }, [searchTerm]);

    const fetchData = useCallback(async () => {
        try {
            // Obtener sesiones activas para deshabilitar botón de ingreso si el peke ya está en sala
            try {
                const activeSess = await getActiveSessions();
                setActiveChildIds(new Set(activeSess.map(s => s.childId)));
            } catch (err) {
                console.error('Error fetching active sessions in records:', err);
            }

            const isSearching = debouncedSearch.trim().length > 0;
            let results: RecordData[] = [];
            
            if (filter === 'all' || filter === 'tutors') {
                const isHex = /^[0-9a-fA-F-]+$/.test(debouncedSearch);
                let idFilter = '';
                if (isHex && debouncedSearch.length >= 4) {
                    const cleanHex = debouncedSearch.replace(/-/g, '').toLowerCase();
                    if (cleanHex.length <= 32) {
                        const minId = cleanHex.padEnd(32, '0').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
                        const maxId = cleanHex.padEnd(32, 'f').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
                        idFilter = `,and(id.gte.${minId},id.lte.${maxId})`;
                    }
                }

                let q = supabase.from('clientes').select('*, ninos(id, observaciones)', { count: 'exact' });
                if (isSearching) {
                    q = q.or(`nombre.ilike.%${debouncedSearch}%,id.filter.ilike.%${debouncedSearch}%${idFilter}`);
                }
                
                const { data: clients, count } = await q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1).order('nombre');
                
                if (clients && clients.length > 0) {
                    results = [...results, ...clients.map(c => {
                        const totalKids = c.ninos ? c.ninos.length : 0;
                        const allKidsActive = totalKids > 0 && c.ninos.every((n: any) => activeChildIds.has(n.id));
                        const kidsObs = c.ninos ? c.ninos.map((n: any) => n.observaciones).filter(Boolean).join(' | ') : '';
                        return {
                            id: c.id,
                            name: c.nombre,
                            type: 'tutor' as const,
                            subtext: 'Tutor / Responsable',
                            details: kidsObs || 'Sin observaciones',
                            tutorPhone: c.telefono,
                            isBlacklisted: false,
                            allKidsActive: allKidsActive
                        };
                    })];
                    if (filter === 'tutors') setTotal(count || 0);
                }
            }

            if (filter === 'all' || filter === 'children') {
                const isHex = /^[0-9a-fA-F-]+$/.test(debouncedSearch);
                let idFilter = '';
                if (isHex && debouncedSearch.length >= 4) {
                    const cleanHex = debouncedSearch.replace(/-/g, '').toLowerCase();
                    if (cleanHex.length <= 32) {
                        const minId = cleanHex.padEnd(32, '0').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
                        const maxId = cleanHex.padEnd(32, 'f').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
                        idFilter = `,and(id.gte.${minId},id.lte.${maxId})`;
                    }
                }

                let q = supabase.from('ninos').select('*, clientes(nombre, telefono)', { count: 'exact' });
                if (isSearching) {
                    q = q.or(`nombre.ilike.%${debouncedSearch}%${idFilter}`);
                }
                
                const { data: children, count } = await q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1).order('nombre');
                
                if (children && children.length > 0) {
                    results = [...results, ...children.map(c => ({
                        id: c.id,
                        name: c.nombre,
                        type: 'child' as const,
                        subtext: `Niño(a) · ${c.edad} años`,
                        details: c.observaciones || 'Sin observaciones',
                        isBlacklisted: !!c.en_lista_negra,
                        tutorPhone: c.clientes?.telefono,
                        observations: c.observaciones
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
        setEditObservations(item.observations || '');
        setEditBlacklisted(!!item.isBlacklisted);
        
        if (item.type === 'tutor') {
            const rawPhones = item.tutorPhone ? item.tutorPhone.split(',').map(p => p.trim()) : [];
            const locals: string[] = [];
            const prefixes: string[] = [];

            rawPhones.forEach(full => {
                let d = full.replace(/\D/g, '');
                // Limpiar anomalía de doble LADA de México en la lectura
                if (d.startsWith('5252') && d.length === 14) {
                    d = d.substring(2);
                }

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
                await supabase.from('ninos').update({ 
                    nombre: editName,
                    observaciones: editObservations,
                    en_lista_negra: editBlacklisted
                }).eq('id', editItem.id);
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
            const { data: children } = await supabase.from('ninos').select('*').eq('cliente_id', tutor.id);
            if (children && onEntry) {
                onEntry({ registeredChildren: children, tutorId: tutor.id, tutorName: tutor.name, tutorContact: tutor.tutorPhone || tutor.details });
            }
        } catch (err) {
            showToast('Error al buscar niños', 'error');
        } finally {
            // Loading handled internally
        }
    };

    const handleSaveNewRegistration = async () => {
        if (!regTutorName.trim()) {
            showToast('El nombre del tutor es obligatorio', 'error');
            return;
        }
        if (regTutorPhone.replace(/\D/g, '').length < 10) {
            showToast('El teléfono debe tener 10 dígitos', 'error');
            return;
        }
        const validNinos = regNinos.filter(n => n.nombre.trim());
        if (validNinos.length === 0) {
            showToast('Debe agregar al menos un niño', 'error');
            return;
        }

        setIsRegistering(true);
        try {
            const formattedPhone = formatPhone(regTutorPhone);
            const { data: tutorData, error: tutorError } = await supabase
                .from('clientes')
                .insert([{ 
                    nombre: toTitleCase(regTutorName), 
                    telefono: formattedPhone 
                }])
                .select()
                .single();

            if (tutorError || !tutorData) throw tutorError || new Error('Error al guardar tutor');

            const ninosInserts = validNinos.map(n => ({
                cliente_id: tutorData.id,
                nombre: toTitleCase(n.nombre),
                edad: n.edad
            }));

            const { error: ninosError } = await supabase
                .from('ninos')
                .insert(ninosInserts);

            if (ninosError) throw ninosError;

            showToast('Registro guardado exitosamente', 'success');
            setShowRegistrationModal(false);
            setRegTutorName('');
            setRegTutorPhone('');
            setRegNinos([{ nombre: '', edad: 0 }]);
            fetchData();
        } catch (err) {
            showToast('Error al guardar el registro', 'error');
        } finally {
            setIsRegistering(false);
        }
    };

    return (
        <div className={styles.recordsContainer}>
            <header className={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h1 className={styles.title}>Registros del Sistema</h1>
                    <span className={styles.countBadge}>{total} registros</span>
                </div>
                <button 
                    className="btn btn-primary" 
                    onClick={() => {
                        setRegTutorName('');
                        setRegTutorPhone('');
                        setRegNinos([{ nombre: '', edad: 0 }]);
                        setShowRegistrationModal(true);
                    }}
                    style={{ fontSize: '0.85rem' }}
                >
                    <FontAwesomeIcon icon={faPlus} /> Nuevo Registro
                </button>
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
                            <tr key={`${item.type}-${item.id}`} className={item.type === 'child' ? styles.childRow : styles.tutorRow}>
                                <td data-label="Nombre">
                                    <div className={styles.nameCell}>
                                        <div className={`${styles.avatar} ${item.type === 'child' ? styles.childAvatar : styles.tutorAvatar}`}>
                                            <FontAwesomeIcon icon={item.type === 'child' ? faChild : faUser} />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span className={styles.mainName}>{item.name}</span>
                                            {item.tutorPhone && (
                                                <span style={{ fontSize: '0.85rem', color: '#64748b', margin: '4px 0' }}>
                                                    <FontAwesomeIcon icon={faPhone} style={{ marginRight: '6px', color: 'var(--brand-500)' }} />
                                                    {formatDisplayPhone(item.tutorPhone.split(',')[0])}
                                                </span>
                                            )}
                                            <span style={{ fontSize: '0.85rem', fontFamily: 'SFMono-Regular, Consolas, \"Liberation Mono\", Menlo, monospace', color: 'var(--brand-600)', fontWeight: 800, background: 'var(--brand-50)', padding: '2px 6px', borderRadius: '4px', alignSelf: 'flex-start', marginTop: '2px', letterSpacing: '1px' }}>
                                                ID: {item.id.substring(0,8).toUpperCase()}
                                            </span>
                                        </div>
                                    </div>
                                </td>
                                <td data-label="Tipo">
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <span className={`${styles.badge} ${item.type === 'child' ? styles.childBadge : styles.tutorBadge}`}>
                                            {item.type === 'child' ? 'Niño' : 'Tutor'}
                                        </span>
                                        {item.isBlacklisted && (
                                            <span style={{ background: '#fee2e2', color: '#ef4444', padding: '4px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 800, textAlign: 'center', border: '1px solid #fecaca' }}>
                                                LISTA NEGRA
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td data-label="Detalles" className={styles.detailsCell}>
                                    {item.details}
                                </td>
                                <td data-label="Acciones">
                                    <div className={styles.actionGroup}>
                                        <button 
                                            className={`btn ${item.isBlacklisted ? 'btn-danger' : (item.type === 'child' && activeChildIds.has(item.id)) ? 'btn-success' : 'btn-primary'}`}
                                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderRadius: '8px' }}
                                            onClick={() => item.type === 'child' ? (onEntry && onEntry(item)) : handleTutorEntry(item)}
                                            disabled={item.type === 'child' && activeChildIds.has(item.id)}
                                        >
                                            <FontAwesomeIcon icon={item.isBlacklisted ? faLock : (item.type === 'child' && activeChildIds.has(item.id)) ? faCheckCircle : faTicket} />
                                            {item.type === 'child' && activeChildIds.has(item.id) ? ' En Sala' : ' Ingreso'}
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
                        <div className={styles.editModalBody} style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                            <div className={styles.field} style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '0.5rem' }}>Nombre Completo</label>
                                <input className={styles.editInput} value={editName} onChange={e => setEditName(toTitleCase(e.target.value))} />
                            </div>

                            {editItem.type === 'child' && (
                                <>
                                    <div className={styles.field} style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '0.5rem' }}>Observaciones / Notas Médicas</label>
                                        <textarea 
                                            className={styles.editInput} 
                                            style={{ minHeight: '100px', resize: 'vertical' }}
                                            value={editObservations} 
                                            onChange={e => setEditObservations(e.target.value)}
                                            placeholder="Ej: Alérgico al chocolate, problemas respiratorios..."
                                        />
                                    </div>
                                    
                                    <div className={styles.field} style={{ marginBottom: '1.5rem', background: editBlacklisted ? '#fff1f2' : '#f8fafc', padding: '1rem', borderRadius: '12px', border: editBlacklisted ? '1px solid #fecaca' : '1px solid #e2e8f0', transition: 'all 0.3s ease' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: editBlacklisted ? '#e11d48' : '#475569' }}>
                                                    <FontAwesomeIcon icon={faUserSlash} style={{ marginRight: '8px' }} />
                                                    Estatus: Lista Negra
                                                </label>
                                                <small style={{ color: '#64748b' }}>Impedir el acceso de este niño al sistema.</small>
                                            </div>
                                            <div 
                                                onClick={() => setEditBlacklisted(!editBlacklisted)}
                                                style={{ 
                                                    width: '50px', 
                                                    height: '26px', 
                                                    background: editBlacklisted ? '#e11d48' : '#cbd5e1', 
                                                    borderRadius: '13px', 
                                                    position: 'relative', 
                                                    cursor: 'pointer',
                                                    transition: 'all 0.3s ease'
                                                }}
                                            >
                                                <div style={{ 
                                                    width: '20px', 
                                                    height: '20px', 
                                                    background: 'white', 
                                                    borderRadius: '50%', 
                                                    position: 'absolute', 
                                                    top: '3px', 
                                                    left: editBlacklisted ? '27px' : '3px',
                                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                                }} />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                            
                            {editItem.type === 'tutor' && (
                                <div className={styles.phonesSection}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>Teléfonos de Contacto</label>
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
                                                    onChange={e => { const up = [...editPrefixes]; up[idx] = formatPrefix(e.target.value); setEditPrefixes(up); }} 
                                                    maxLength={3}
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

            {showRegistrationModal && (
                <div className={styles.modalOverlay} onClick={() => !isRegistering && setShowRegistrationModal(false)} style={{ zIndex: 1100 }}>
                    <div onClick={e => e.stopPropagation()} style={{ 
                        background: '#ffffff',
                        width: '100%',
                        maxWidth: '440px',
                        borderRadius: '1.5rem',
                        overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        animation: 'slideUp 0.25s ease'
                    }}>
                        <div style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
                            <h3 style={{ margin: 0, color: '#0f172a', fontWeight: 800, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <FontAwesomeIcon icon={faUserPlus} style={{ color: 'var(--brand-500)' }} /> Nuevo Registro Rápido
                            </h3>
                            <button className={styles.closeBtn} onClick={() => setShowRegistrationModal(false)} disabled={isRegistering}>
                                <FontAwesomeIcon icon={faTimes} />
                            </button>
                        </div>
                        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Tutor / Responsable <span style={{color: '#ef4444'}}>*</span>
                                </label>
                                <input 
                                    type="text" 
                                    style={{ padding: '0.8rem 1.2rem', border: '2px solid #e2e8f0', borderRadius: '1rem', outline: 'none', fontSize: '1rem', width: '100%', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
                                    placeholder="Nombre completo"
                                    value={regTutorName}
                                    onChange={e => setRegTutorName(toTitleCase(e.target.value))}
                                    autoFocus
                                    onFocus={e => e.target.style.borderColor = 'var(--brand-500)'}
                                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Teléfono <span style={{color: '#ef4444'}}>*</span>
                                </label>
                                <input 
                                    type="tel" 
                                    style={{ padding: '0.8rem 1.2rem', border: '2px solid #e2e8f0', borderRadius: '1rem', outline: 'none', fontSize: '1rem', width: '100%', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
                                    placeholder="Ej. (352) 123-4567"
                                    value={formatPhone(regTutorPhone)}
                                    onChange={e => setRegTutorPhone(e.target.value.replace(/\D/g, '').substring(0, 10))}
                                    onFocus={e => e.target.style.borderColor = 'var(--brand-500)'}
                                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                />
                            </div>

                            <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '1rem', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <h4 style={{ margin: 0, color: '#334155', fontWeight: 800, fontSize: '1rem' }}>Pekes</h4>
                                    <button 
                                        className="btn btn-ghost" 
                                        onClick={() => setRegNinos([...regNinos, { nombre: '', edad: 0 }])}
                                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', background: '#e0e7ff', color: '#4f46e5', border: 'none', borderRadius: '0.5rem', fontWeight: 700 }}
                                    >
                                        <FontAwesomeIcon icon={faPlus} /> Agregar Peke
                                    </button>
                                </div>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                    {regNinos.map((n, i) => (
                                        <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                            <input 
                                                type="text" 
                                                style={{ flex: 1, padding: '0.8rem 1rem', border: '2px solid #e2e8f0', borderRadius: '0.75rem', outline: 'none', fontSize: '0.9rem', transition: 'border-color 0.2s' }}
                                                placeholder="Nombre del peke"
                                                value={n.nombre}
                                                onChange={e => {
                                                    const updated = [...regNinos];
                                                    updated[i].nombre = toTitleCase(e.target.value);
                                                    setRegNinos(updated);
                                                }}
                                                onFocus={e => e.target.style.borderColor = 'var(--brand-500)'}
                                                onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                            />
                                            <input 
                                                type="number" 
                                                style={{ width: '70px', padding: '0.8rem 0.5rem', border: '2px solid #e2e8f0', borderRadius: '0.75rem', outline: 'none', fontSize: '0.9rem', textAlign: 'center', transition: 'border-color 0.2s' }}
                                                placeholder="Edad"
                                                value={n.edad || ''}
                                                onChange={e => {
                                                    const updated = [...regNinos];
                                                    updated[i].edad = parseInt(e.target.value) || 0;
                                                    setRegNinos(updated);
                                                }}
                                                onFocus={e => e.target.style.borderColor = 'var(--brand-500)'}
                                                onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                                min={0}
                                                max={17}
                                            />
                                            {regNinos.length > 1 && (
                                                <button 
                                                    className="btn btn-ghost"
                                                    onClick={() => {
                                                        const updated = regNinos.filter((_, idx) => idx !== i);
                                                        setRegNinos(updated);
                                                    }}
                                                    style={{ color: '#ef4444', padding: '0.5rem' }}
                                                >
                                                    <FontAwesomeIcon icon={faTrash} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div style={{ padding: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem', background: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
                            <button className="btn btn-ghost" onClick={() => setShowRegistrationModal(false)} disabled={isRegistering} style={{ fontWeight: 700 }}>
                                Cancelar
                            </button>
                            <button className="btn btn-primary" onClick={handleSaveNewRegistration} disabled={isRegistering} style={{ borderRadius: '0.75rem', padding: '0.6rem 1.5rem', fontWeight: 800 }}>
                                {isRegistering ? 'Guardando...' : 'Guardar Registro'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
