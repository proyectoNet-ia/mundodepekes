
import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from './Records.module.css';
import { supabase } from '../../lib/supabase';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faUser, faChild, faEllipsisV, faTimes, faTicket, faPen, faPhone, faChevronLeft, faChevronRight, faAddressBook } from '@fortawesome/free-solid-svg-icons';

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
    const [menuPos, setMenuPos]       = useState<{ top: number; right: number }>({ top: 0, right: 0 });
    const [editItem, setEditItem]   = useState<RecordData | null>(null);
    const [editName, setEditName]   = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [isSaving, setIsSaving]   = useState(false);
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
        onEntry({ childName: item.name, tutorName: item.tutorName, tutorContact: item.tutorPhone, childId: item.id });
    };

    const openEditModal = (item: RecordData) => {
        setEditItem(item);
        setEditName(item.name);
        setEditPhone(item.tutorPhone || '');
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
            if (editItem.type === 'child') {
                await supabase.from('ninos').update({ nombre: editName }).eq('id', editItem.id);
            } else {
                await supabase.from('clientes').update({ nombre: editName, telefono: editPhone }).eq('id', editItem.id);
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
                                <td>
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
                                <td>
                                    <span className={`${styles.badge} ${item.type === 'child' ? styles.badgeSuccess : styles.badgeWarning}`}>
                                        {item.type === 'child' ? 'NIÑO' : 'TUTOR'}
                                    </span>
                                    {item.isBlacklisted && <span className={`${styles.badge} ${styles.badgeDanger}`} style={{ marginLeft: '0.4rem' }}>⛔</span>}
                                </td>
                                <td>{item.subtext}</td>
                                <td className={styles.detailsCell}>{item.details}</td>
                                <td>
                                    <div className={styles.actionGroup} ref={menuOpenId === item.id ? menuRef : null}>
                                        {item.type === 'child' && (
                                            <button
                                                className="btn btn-primary"
                                                style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                                                onClick={() => handleNewEntry(item)}
                                                title="Iniciar ingreso para este niño"
                                            >
                                                <FontAwesomeIcon icon={faTicket} /> Ingreso
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
                                                    {item.tutorPhone && (
                                                        <button className={styles.menuItem} onClick={() => { window.open(`tel:${item.tutorPhone}`); setMenuOpenId(null); }}>
                                                            <FontAwesomeIcon icon={faPhone} /> Llamar al tutor
                                                        </button>
                                                    )}
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
                            <input className={styles.editInput} value={editName} onChange={e => setEditName(e.target.value)} />
                            {editItem.type === 'tutor' && (
                                <>
                                    <label style={{ marginTop: '1rem' }}>Teléfono</label>
                                    <input className={styles.editInput} value={editPhone} onChange={e => setEditPhone(e.target.value)} />
                                </>
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
