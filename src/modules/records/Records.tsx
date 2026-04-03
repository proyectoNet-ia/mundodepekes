
import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from './Records.module.css';
import { supabase } from '../../lib/supabase';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faUser, faChild, faEllipsisV, faTimes, faTicket, faPen, faPhone, faChevronLeft, faChevronRight, faAddressBook, faLock, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import { faWhatsapp } from '@fortawesome/free-brands-svg-icons';
import { PINModal } from '../../components/PINModal';

// Capitaliza nombres propios respetando preposiciones en español
// Ej: "fernando de la cruz" → "Fernando de la Cruz"
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

export const Records: React.FC<RecordsProps> = ({ onEntry }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [filter, setFilter]   = useState<'all' | 'children' | 'tutors'>('all');
    const [data, setData]       = useState<RecordData[]>([]);
    const [total, setTotal]     = useState(0);
    const [page, setPage]       = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const [menuPos, setMenuPos]       = useState<{ top: number; right: number; left?: number }>({ top: 0, right: 0 });
    const [editItem, setEditItem]   = useState<RecordData | null>(null);
    const [editName, setEditName]   = useState('');
    const [editPhones, setEditPhones] = useState<string[]>(['']); // Múltiples teléfonos
    const [isSaving, setIsSaving]   = useState(false);
    const [showPinModal, setShowPinModal] = useState(false);
    const [pendingChild, setPendingChild] = useState<RecordData | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Debounce del término de búsqueda
    useEffect(() => {
        const t = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setPage(1); // Reset page on new search
        }, 350);
        return () => clearTimeout(t);
    }, [searchTerm]);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const isSearching = debouncedSearch.trim().length > 0;
            let results: RecordData[] = [];
            let countTotal = 0;

            if (filter === 'all' || filter === 'tutors') {
                let q = supabase
                    .from('clientes')
                    .select('*', { count: 'exact' })
                    .or(`nombre.ilike.%${debouncedSearch}%,telefono.ilike.%${debouncedSearch}%`);

                if (!isSearching) {
                    q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
                }

                const { data: tutors, count } = await q;
                countTotal += count || 0;
                tutors?.forEach(t => {
                    results.push({
                        id: t.id,
                        name: t.nombre,
                        type: 'tutor',
                        subtext: t.telefono || 'Sin teléfono',
                        details: `${t.visitas_acumuladas} visitas acumuladas`,
                        visits: t.visitas_acumuladas,
                        tutorPhone: t.telefono
                    });
                });
            }

            if (filter === 'all' || filter === 'children') {
                let q = supabase
                    .from('ninos')
                    .select('*, clientes(id, nombre, telefono)', { count: 'exact' })
                    .ilike('nombre', `%${debouncedSearch}%`);

                if (!isSearching) {
                    q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
                }

                const { data: children, count } = await q;
                countTotal += count || 0;
                children?.forEach(c => {
                    results.push({
                        id: c.id,
                        name: c.nombre,
                        type: 'child',
                        subtext: `Tutor: ${(c.clientes as any)?.nombre || 'Desconocido'}`,
                        details: c.observaciones || 'Sin observaciones',
                        isBlacklisted: c.en_lista_negra,
                        tutorName: (c.clientes as any)?.nombre,
                        tutorPhone: (c.clientes as any)?.telefono
                    });
                });
            }

            setData(results);
            setTotal(countTotal);
        } catch (error) {
            console.error('Error fetching records:', error);
        } finally {
            setIsLoading(false);
        }
    }, [debouncedSearch, filter, page]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Cerrar menú al hacer clic afuera
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpenId(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleNewEntry = (item: RecordData) => {
        if (!onEntry) { alert('Sin manejador de ingresos configurado.'); return; }
        
        if (item.isBlacklisted) {
            setPendingChild(item);
            setShowPinModal(true);
            return;
        }

        onEntry({ 
            childName: item.name, 
            tutorName: item.tutorName, 
            tutorContact: item.tutorPhone, 
            childId: item.id 
        });
    };

    const handleAuthorizedEntry = () => {
        if (!pendingChild || !onEntry) return;
        onEntry({ 
            childName: pendingChild.name, 
            tutorName: pendingChild.tutorName, 
            tutorContact: pendingChild.tutorPhone, 
            childId: pendingChild.id 
        });
        setPendingChild(null);
    };

    const openEditModal = (item: RecordData) => {
        setEditItem(item);
        setEditName(item.name);
        // Separar teléfonos por coma (soporte de múltiples)
        const phones = (item.tutorPhone || '').split(',').map(p => p.trim()).filter(Boolean);
        setEditPhones(phones.length > 0 ? phones : ['']);
        setMenuOpenId(null);
    };

    const toggleMenu = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
        if (menuOpenId === id) { setMenuOpenId(null); return; }
        const rect = e.currentTarget.getBoundingClientRect();
        setMenuPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
        setMenuOpenId(id);
    };

    const handleSaveEdit = async () => {
        if (!editItem) return;
        setIsSaving(true);
        try {
            const phoneStr = editPhones.filter(p => p.trim()).join(', ');
            if (editItem.type === 'child') {
                await supabase.from('ninos').update({ nombre: editName }).eq('id', editItem.id);
            } else {
                await supabase.from('clientes').update({ nombre: editName, telefono: phoneStr }).eq('id', editItem.id);
            }
            setEditItem(null);
            fetchData();
        } catch (err) {
            console.error(err);
            alert('Error al guardar.');
        } finally {
            setIsSaving(false);
        }
    };

    const isSearching = debouncedSearch.trim().length > 0;
    const totalPages = Math.ceil(total / PAGE_SIZE / (filter === 'all' ? 2 : 1));

    return (
        <div className={styles.recordsContainer}>
            <header className={styles.header}>
                <h2><FontAwesomeIcon icon={faAddressBook} /> Registros</h2>
                <span className={styles.totalBadge}>
                    {isLoading ? '...' : isSearching ? `${data.length} resultados` : `${total} registros totales`}
                </span>
            </header>

            {/* Search */}
            <div className={styles.searchBar}>
                <FontAwesomeIcon icon={faSearch} style={{ color: 'var(--text-tertiary)', alignSelf: 'center', flexShrink: 0 }} />
                <input
                    type="text"
                    placeholder="Buscar en TODOS los registros: nombre, tutor o teléfono..."
                    className={styles.searchInput}
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    autoFocus
                />
                {searchTerm && (
                    <button className={styles.clearBtn} onClick={() => setSearchTerm('')} title="Limpiar búsqueda">
                        <FontAwesomeIcon icon={faTimes} />
                    </button>
                )}
            </div>

            {/* Search hint */}
            <p className={styles.searchHint}>
                {isSearching
                    ? `🔍 Buscando "${debouncedSearch}" en toda la base de datos...`
                    : `Mostrando página ${page} — ${PAGE_SIZE} registros por página. Escribe para buscar en todo el historial.`}
            </p>

            {/* Filters */}
            <div className={styles.filterTabs}>
                {(['all', 'children', 'tutors'] as const).map(f => (
                    <button
                        key={f}
                        className={`${styles.filterBtn} ${filter === f ? styles.activeFilter : ''}`}
                        onClick={() => { setFilter(f); setPage(1); }}
                    >
                        {f === 'all' ? 'Todos' : f === 'children' ? 'Pekes (Niños)' : 'Tutores (Padres)'}
                    </button>
                ))}
            </div>

            {/* Table */}
            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>Tipo</th>
                            <th>Contacto</th>
                            <th>Detalles</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td colSpan={5} style={{ textAlign: 'center', padding: '3rem' }}>
                                    <div className={styles.loadingRow}>
                                        <div className={styles.loadingSpinner} />
                                        Cargando registros...
                                    </div>
                                </td>
                            </tr>
                        ) : data.length > 0 ? data.map(item => (
                            <tr key={item.id}>
                                <td data-label="Nombre">
                                    <div className={styles.clientName}>
                                        <div className={`${styles.avatar} ${item.type === 'child' ? styles.avatarChild : styles.avatarTutor}`}>
                                            <FontAwesomeIcon icon={item.type === 'child' ? faChild : faUser} />
                                        </div>
                                        <div>
                                            <span className={`${styles.primaryText} ${item.isBlacklisted ? styles.blacklisted : ''}`}>{item.name}</span>
                                            <span className={styles.secondaryText}>ID: {item.id.substring(0, 8)}…</span>
                                        </div>
                                    </div>
                                </td>
                                <td data-label="Tipo">
                                    <span className={`${styles.badge} ${item.type === 'child' ? styles.badgeSuccess : styles.badgeWarning}`}>
                                        {item.type === 'child' ? 'NIÑO' : 'TUTOR'}
                                    </span>
                                    {item.isBlacklisted && <span className={`${styles.badge} ${styles.badgeDanger}`} style={{ marginLeft: '0.4rem' }}>⛔</span>}
                                </td>
                                <td data-label="Contacto">{item.subtext}</td>
                                <td data-label="Detalles" className={styles.detailsCell}>{item.details}</td>
                                <td data-label="Acciones">
                                    <div className={styles.actionGroup} ref={menuOpenId === item.id ? menuRef : null}>
                                        {item.type === 'child' && (
                                            <button
                                                className={`btn ${item.isBlacklisted ? 'btn-danger' : 'btn-primary'}`}
                                                style={{ 
                                                    padding: '0.4rem 0.9rem', 
                                                    fontSize: '0.8rem', 
                                                    whiteSpace: 'nowrap',
                                                    background: item.isBlacklisted ? '#dc2626' : '',
                                                    color: '#ffffff'
                                                }}
                                                onClick={() => handleNewEntry(item)}
                                                title={item.isBlacklisted ? "Requiere autorización de gerente" : "Iniciar ingreso para este niño"}
                                            >
                                                <FontAwesomeIcon icon={item.isBlacklisted ? faLock : faTicket} /> 
                                                {item.isBlacklisted ? ' Autorizar' : ' Ingreso'}
                                            </button>
                                        )}
                                        <div style={{ position: 'relative' }}>
                                            <button
                                                className={styles.actionBtn}
                                                title="Más opciones"
                                                onClick={(e) => toggleMenu(e, item.id)}
                                            >
                                                <FontAwesomeIcon icon={faEllipsisV} />
                                            </button>
                                            {menuOpenId === item.id && (
                                                <div
                                                    className={styles.contextMenu}
                                                    style={{ top: menuPos.top, right: menuPos.right }}
                                                >
                                                    <button className={styles.menuItem} onClick={() => openEditModal(item)}>
                                                        <FontAwesomeIcon icon={faPen} /> Editar datos
                                                    </button>
                                                    {item.tutorPhone && (() => {
                                                        const cleanPhone = item.tutorPhone.split(',')[0].replace(/\D/g, '');
                                                        return (
                                                            <>
                                                                <button className={`${styles.menuItem} ${styles.mobileOnly}`} onClick={() => { window.open(`tel:${cleanPhone}`); setMenuOpenId(null); }}>
                                                                    <FontAwesomeIcon icon={faPhone} /> Llamar al tutor
                                                                </button>
                                                                <button className={`${styles.menuItem} ${styles.whatsappItem}`} onClick={() => { window.open(`https://wa.me/52${cleanPhone}`, '_blank'); setMenuOpenId(null); }}>
                                                                    <FontAwesomeIcon icon={faWhatsapp} style={{ color: '#25D366' }} /> Enviar WhatsApp
                                                                </button>
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={5}>
                                    <div className={styles.emptyState}>
                                        <FontAwesomeIcon icon={faSearch} size="3x" />
                                        <p>{isSearching ? `Sin resultados para "${debouncedSearch}"` : 'No hay registros aún.'}</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination — only when not searching */}
            {!isSearching && totalPages > 1 && (
                <div className={styles.pagination}>
                    <button className={styles.pageBtn} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                        <FontAwesomeIcon icon={faChevronLeft} />
                    </button>
                    <span className={styles.pageInfo}>Página {page} / {totalPages}</span>
                    <button className={styles.pageBtn} onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                        <FontAwesomeIcon icon={faChevronRight} />
                    </button>
                </div>
            )}

            {/* Edit Modal */}
            {editItem && (
                <div className={styles.modalOverlay}>
                    <div className={styles.editModal}>
                        <div className={styles.editModalHeader}>
                            <h3>Editar {editItem.type === 'child' ? 'Niño' : 'Tutor'}</h3>
                            <button onClick={() => setEditItem(null)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                <FontAwesomeIcon icon={faTimes} />
                            </button>
                        </div>
                        <div className={styles.editModalBody}>
                            <label>Nombre</label>
                            <input
                                className={styles.editInput}
                                value={editName}
                                onChange={e => setEditName(toTitleCase(e.target.value))}
                                autoFocus
                            />
                            {editItem.type === 'tutor' && (
                                <div style={{ marginTop: '1.25rem' }}>
                                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <span>Teléfonos de Contacto</span>
                                        <button
                                            onClick={() => setEditPhones(prev => [...prev, ''])}
                                            style={{ background: 'var(--brand-50)', color: 'var(--brand-600)', border: '1px solid var(--brand-200)', borderRadius: '8px', padding: '0.25rem 0.6rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            <FontAwesomeIcon icon={faPlus} /> Añadir
                                        </button>
                                    </label>
                                    {editPhones.map((phone, idx) => (
                                        <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                                            <FontAwesomeIcon icon={faPhone} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                                            <input
                                                className={styles.editInput}
                                                style={{ flex: 1, margin: 0 }}
                                                type="tel"
                                                value={phone}
                                                placeholder={idx === 0 ? 'Teléfono principal' : 'Teléfono adicional'}
                                                onChange={e => {
                                                    const updated = [...editPhones];
                                                    updated[idx] = e.target.value;
                                                    setEditPhones(updated);
                                                }}
                                            />
                                            {editPhones.length > 1 && (
                                                <button
                                                    onClick={() => setEditPhones(prev => prev.filter((_, i) => i !== idx))}
                                                    style={{ background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '8px', padding: '0.4rem 0.6rem', cursor: 'pointer' }}
                                                    title="Eliminar teléfono"
                                                >
                                                    <FontAwesomeIcon icon={faTrash} />
                                                </button>
                                            )}
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
            {/* PIN Modal for Blacklist Overrides */}
            <PINModal 
                isOpen={showPinModal}
                onClose={() => { setShowPinModal(false); setPendingChild(null); }}
                onSuccess={handleAuthorizedEntry}
                actionDescription={`Ingreso de niño en Lista Negra: ${pendingChild?.name} (ID: ${pendingChild?.id})`}
                message={`El niño ${pendingChild?.name} está en LISTA NEGRA. Para autorizar su ingreso excepcional, se requiere PIN de Gerencia.`}
            />
        </div>
    );
};
