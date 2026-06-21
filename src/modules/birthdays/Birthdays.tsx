import React, { useState, useEffect } from 'react';
import { type UserProfile } from '../../lib/authService';
import { birthdayService, type Cumpleanos, type NinoCumpleanos } from '../../lib/birthdayService';
import { useToast } from '../../components/Toast';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCakeCandles, faPlus, faTimes, faTrash, faPlay, faCheck, faPen } from '@fortawesome/free-solid-svg-icons';
import { getPackages, type Package } from '../../lib/packageService';
import { stockService, type StockItem } from '../../lib/stockService';
import { PrinterService } from '../../lib/printerService';

interface Props {
  user: UserProfile;
  onCancel: () => void;
  initialSelectedId?: string | null;
  onClearSelectedId?: () => void;
}

const BirthdayProgressBar = ({ fechaInicio, horaInicio, duracionMinutos }: { fechaInicio: string, horaInicio: string, duracionMinutos: number }) => {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 10000);
        return () => clearInterval(interval);
    }, []);

    const [year, month, day] = fechaInicio.split('-');
    const [h, m] = horaInicio.split(':');
    const start = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(h), parseInt(m));
    const end = new Date(start.getTime() + duracionMinutos * 60000);

    const elapsed = now.getTime() - start.getTime();
    const totalMs = duracionMinutos * 60000;
    const rawProgress = (elapsed / totalMs) * 100;
    const progress = Math.min(100, Math.max(0, rawProgress));
    
    const remainingMs = end.getTime() - now.getTime();
    const isExpired = remainingMs <= 0;
    const remainMins = Math.max(0, Math.round(remainingMs / 60000));

    let color = '#3b82f6';
    if (isExpired) color = '#ef4444';
    else if (remainMins <= 10) color = '#f97316';
    else if (remainMins <= 30) color = '#eab308';

    return (
        <div style={{ marginTop: '1rem', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem', color: '#64748b' }}>
                <span>Inicio: {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span style={{ fontWeight: 'bold', color }}>
                    {isExpired ? 'Tiempo expirado' : `${remainMins} min restantes`}
                </span>
                <span>Fin: {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress}%`, background: color, transition: 'width 1s linear' }}></div>
            </div>
        </div>
    );
};
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

const AREA_MAP: Record<string, string> = {
  'Mundo de Pekes': 'Mundo de Pekes',
  'Mundo Pekes': 'Mundo de Pekes',
  'Trampolín Park': 'Trampolín Park',
  'Trampolin Park': 'Trampolín Park',
  'Trampolín': 'Trampolín Park',
  'Trampolin': 'Trampolín Park',
  'Área Mixta': 'Área Mixta',
  'Area Mixta': 'Área Mixta',
  'Mixto': 'Área Mixta'
};

export const Birthdays: React.FC<Props> = ({ user, onCancel, initialSelectedId, onClearSelectedId }) => {
  const { showToast } = useToast();
  const [eventos, setEventos] = useState<Cumpleanos[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedEvento, setSelectedEvento] = useState<Cumpleanos | null>(null);
  const [isManaging, setIsManaging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [paquetesPrivados, setPaquetesPrivados] = useState<Package[]>([]);
  const [telefonoInput, setTelefonoInput] = useState('');
  const [inventory, setInventory] = useState<StockItem[]>([]);
  const [showLiquidar, setShowLiquidar] = useState(false);
  const [totalNinos, setTotalNinos] = useState(10);
  const [metodoPagoLiquidacion, setMetodoPagoLiquidacion] = useState('Efectivo');
  const [montoEfectivo, setMontoEfectivo] = useState<number | ''>('');
  const [montoTarjeta, setMontoTarjeta] = useState<number | ''>('');
  const [extras, setExtras] = useState<{ item: StockItem, qty: number }[]>([]);
  const [searchItem, setSearchItem] = useState('');
  const [bebidasIncluidas, setBebidasIncluidas] = useState<{ item: StockItem, qty: number }[]>([]);
  const [searchIncluido, setSearchIncluido] = useState('');

  // Estados para Registro de Invitados
  const [ninosCumple, setNinosCumple] = useState<NinoCumpleanos[]>([]);
  const [newGuestName, setNewGuestName] = useState('');
  const [newGuestPackageId, setNewGuestPackageId] = useState('');
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [editingGuest, setEditingGuest] = useState<{ id: string; nombre_nino: string; paquete_id: string; } | null>(null);
  const [editGuestPackageId, setEditGuestPackageId] = useState('');
  const [editGuestName, setEditGuestName] = useState('');

  useEffect(() => {
    if (editingGuest) {
      setEditGuestPackageId(editingGuest.paquete_id || '');
      setEditGuestName(editingGuest.nombre_nino || '');
    } else {
      setEditGuestPackageId('');
      setEditGuestName('');
    }
  }, [editingGuest]);

  // Estados del Calendario
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  // Estados del Formulario (para validación de disponibilidad)
  const [formFecha, setFormFecha] = useState('');
  const [formHora, setFormHora] = useState('');
  const [formPaqueteId, setFormPaqueteId] = useState('');

  const formatPhone = (raw: string) => {
    const d = raw.replace(/\D/g, '').substring(0, 10);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `(${d.slice(0,3)}) ${d.slice(3)}`;
    return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  };

  const formatDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const isSameDay = (fechaString: string, date: Date) => {
    return fechaString === formatDateString(date);
  };

  // Helper para resolver información de paquete (soporta campos nuevos y legacy por precio)
  const getEventPackageInfo = (ev: Cumpleanos) => {
    if (ev.paquete_id) {
      const pkg = paquetesPrivados.find(p => p.id === ev.paquete_id);
      if (pkg) return pkg;
    }
    return paquetesPrivados.find(p => p.precio === ev.precio_por_nino) || null;
  };

  // Validación de traslapes en tiempo real (sobrevivencia de RLS y áreas)
  const conflict = React.useMemo(() => {
    if (!formFecha || !formHora || !formPaqueteId) return null;
    const selectedPkg = paquetesPrivados.find(p => p.id === formPaqueteId);
    if (!selectedPkg) return null;
    
    const [h, m] = formHora.split(':').map(Number);
    const duration = selectedPkg.duracion_minutos;
    const startMins = h * 60 + m;
    const endMins = startMins + duration;
    
    for (const ev of eventos) {
        if (selectedEvento && ev.id === selectedEvento.id) continue;
        if (ev.estado === 'cancelado') continue;
        if (ev.fecha_evento !== formFecha) continue;
        
        const evPkg = getEventPackageInfo(ev);
        const evArea = ev.area || evPkg?.area;
        
        // Solo hay conflicto si es la misma área
        if (evArea !== selectedPkg.area) continue;
        
        const [evH, evM] = ev.hora_inicio.split(':').map(Number);
        const evDuration = evPkg?.duracion_minutos || 120;
        const evStartMins = evH * 60 + evM;
        const evEndMins = evStartMins + evDuration;
        
        // Verifica si se solapan los intervalos
        const overlaps = (startMins < evEndMins && endMins > evStartMins);
        if (overlaps) {
            return {
                festejado: ev.nombre_festejado,
                hora_inicio: ev.hora_inicio,
                hora_fin: (() => {
                    const endH = Math.floor(evEndMins / 60);
                    const endMin = evEndMins % 60;
                    return `${String(endH).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
                })(),
                area: evArea
            };
        }
    }
    return null;
  }, [formFecha, formHora, formPaqueteId, eventos, paquetesPrivados, selectedEvento]);

  // Generador de días del mes en formato cuadrícula
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    
    const firstDay = new Date(year, month, 1);
    let startDayOfWeek = firstDay.getDay() - 1; // Ajustar a Lunes
    if (startDayOfWeek === -1) startDayOfWeek = 6;
    
    const totalDays = new Date(year, month + 1, 0).getDate();
    const days = [];
    
    // Relleno mes anterior
    const prevMonthTotalDays = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthTotalDays - i),
        isCurrentMonth: false,
      });
    }
    
    // Días mes actual
    for (let i = 1; i <= totalDays; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      });
    }
    
    // Relleno mes siguiente
    const remainingSlots = 42 - days.length;
    for (let i = 1; i <= remainingSlots; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      });
    }
    
    return days;
  };

  const prevMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const getEventsForDay = (date: Date) => {
    return eventos.filter(ev => isSameDay(ev.fecha_evento, date));
  };

  const openCreateModalWithDate = (dateStr: string) => {
      setFormFecha(dateStr);
      setFormHora('');
      setFormPaqueteId('');
      setTelefonoInput('');
      setShowCreateModal(true);
  };

  const openCreateModalNormal = () => {
      setFormFecha(formatDateString(selectedDate));
      setFormHora('');
      setFormPaqueteId('');
      setTelefonoInput('');
      setShowCreateModal(true);
  };

  useEffect(() => {
    loadData();
    loadPaquetes();
    loadInventory();
  }, []);

  useEffect(() => {
    if (initialSelectedId && eventos.length > 0) {
      const ev = eventos.find(e => e.id === initialSelectedId);
      if (ev) {
        setSelectedEvento(ev);
        setShowLiquidar(false);
        
        const savedExtras = localStorage.getItem(`cumpleanos_extras_${ev.id}`);
        if (savedExtras) {
            try {
                setExtras(JSON.parse(savedExtras));
            } catch (e) {
                console.error("Error parsing saved extras", e);
                setExtras([]);
            }
        } else {
            setExtras([]);
        }
        
        setSearchItem('');
        setBebidasIncluidas([]);
        setSearchIncluido('');
        setNewGuestName('');
        setNewGuestPackageId(ev.paquete_id || '');

        const loadNinos = async () => {
            try {
                const ninos = await birthdayService.getDetallesEvento(ev.id);
                setNinosCumple(ninos);
                setTotalNinos(ninos.length || 10);
            } catch (err) {
                console.error("Error al cargar niños", err);
            }
        };
        loadNinos();

        if (ev.estado === 'en_curso') {
          setShowLiquidar(true);
          const paqueteSeleccionado = getEventPackageInfo(ev);
          if (paqueteSeleccionado?.nombre.toLowerCase().includes('comida')) {
              const refresco = inventory.find(i => i.nombre.toLowerCase().includes('refresco') || i.categoria.toLowerCase().includes('refresco'));
              if (refresco) {
                  setBebidasIncluidas([{ item: refresco, qty: 10 }]);
              }
          }
        }
        onClearSelectedId?.();
      }
    }
  }, [initialSelectedId, eventos, paquetesPrivados, inventory, onClearSelectedId]);

  const loadInventory = async () => {
    try {
      const data = await stockService.getInventory();
      setInventory(data);
    } catch(e) { console.error(e); }
  };

  const loadPaquetes = async () => {
      try {
          const allPackages = await getPackages(true);
          setPaquetesPrivados(allPackages.filter(p => p.es_privado));
      } catch (err) {
          console.error("Error cargando paquetes", err);
      }
  };

  const loadData = async () => {
    try {
      setIsLoading(true);
      const data = await birthdayService.getTodos(); // Cargar todos para el calendario
      setEventos(data);
    } catch (e) {
      console.error(e);
      showToast('Error al cargar cumpleaños', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const openEvento = async (evento: Cumpleanos) => {
      setSelectedEvento(evento);
      setShowLiquidar(false);
      
      const savedExtras = localStorage.getItem(`cumpleanos_extras_${evento.id}`);
      if (savedExtras) {
          try {
              setExtras(JSON.parse(savedExtras));
          } catch (e) {
              console.error("Error parsing saved extras", e);
              setExtras([]);
          }
      } else {
          setExtras([]);
      }
      
      setSearchItem('');
      setBebidasIncluidas([]);
      setSearchIncluido('');
      setIsEditing(false); // Reiniciar modo edición
      setNewGuestName('');
      setNewGuestPackageId(evento.paquete_id || '');
      try {
          const ninos = await birthdayService.getDetallesEvento(evento.id);
          setNinosCumple(ninos);
          setTotalNinos(ninos.length || 10);
      } catch (err) {
          console.error("Error al cargar niños del cumpleaños", err);
          setNinosCumple([]);
          setTotalNinos(10);
      }
  };

  const startEditing = () => {
    if (!selectedEvento) return;
    setFormFecha(selectedEvento.fecha_evento);
    setFormHora(selectedEvento.hora_inicio);
    setFormPaqueteId(selectedEvento.paquete_id || '');
    setTelefonoInput(selectedEvento.telefono_cliente || '');
    setIsEditing(true);
  };

  const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedEvento) return;

    const formData = new FormData(e.currentTarget);
    const packageId = formData.get('paquete_id') as string;
    const selectedPkg = paquetesPrivados.find(p => p.id === packageId);

    const updates = {
        nombre_festejado: formData.get('nombre_festejado') as string,
        nombre_cliente: formData.get('nombre_cliente') as string,
        telefono_cliente: (formData.get('telefono_cliente') as string).replace(/\D/g, ''),
        fecha_evento: formData.get('fecha_evento') as string,
        hora_inicio: formData.get('hora_inicio') as string,
        anticipo_pagado: parseFloat(formData.get('anticipo_pagado') as string) || 0,
        metodo_pago_anticipo: formData.get('metodo_pago_anticipo') as string,
        precio_por_nino: selectedPkg ? selectedPkg.precio : selectedEvento.precio_por_nino,
        paquete_id: packageId || null,
        area: selectedPkg ? selectedPkg.area : selectedEvento.area
    } as any;

    setIsSubmitting(true);
    try {
        const updated = await birthdayService.updateEvento(selectedEvento.id, updates);
        showToast('Cumpleaños actualizado correctamente', 'success');
        setIsEditing(false);
        
        const updatedData = await birthdayService.getTodos();
        setEventos(updatedData);
        setSelectedEvento(updated);
    } catch (err) {
        console.error(err);
        showToast('Error al actualizar cumpleaños', 'error');
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleCancelarEvento = async () => {
    if (!selectedEvento) return;
    if (!window.confirm('¿Seguro que deseas cancelar este evento de cumpleaños? Esta acción no se puede deshacer.')) return;
    setIsManaging(true);
    try {
      await birthdayService.cambiarEstado(selectedEvento.id, 'cancelado');
      showToast('Evento de cumpleaños cancelado', 'success');
      
      const updatedData = await birthdayService.getTodos();
      setEventos(updatedData);
      setSelectedEvento(null);
    } catch (err) {
      console.error(err);
      showToast('Error al cancelar el evento', 'error');
    } finally {
      setIsManaging(false);
    }
  };

  const handleReiniciarTiempo = async () => {
    if (!selectedEvento) return;
    if (!window.confirm('¿Seguro que deseas reiniciar el tiempo del evento? La hora de inicio se establecerá a la hora actual.')) return;
    setIsManaging(true);
    try {
      await birthdayService.cambiarEstado(selectedEvento.id, 'en_curso');
      showToast('Tiempo del evento reiniciado correctamente', 'success');
      
      const updatedData = await birthdayService.getTodos();
      setEventos(updatedData);
      const updatedEv = updatedData.find(e => e.id === selectedEvento.id);
      if (updatedEv) {
          setSelectedEvento(updatedEv);
      } else {
          setSelectedEvento(null);
      }
    } catch (err) {
      console.error(err);
      showToast('Error al reiniciar el tiempo', 'error');
    } finally {
      setIsManaging(false);
    }
  };

  const handleIniciarEvento = async () => {
      if (!selectedEvento) return;

      const [year, month, day] = selectedEvento.fecha_evento.split('-');
      const [hour, min] = selectedEvento.hora_inicio.split(':');
      const fechaInicio = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(min));
      const ahora = new Date();
      const treintaMinAntes = new Date(fechaInicio.getTime() - 30 * 60000);

      if (ahora < treintaMinAntes) {
          showToast('El evento no puede iniciar todavía. Solo puedes iniciarlo hasta 30 minutos antes de la hora programada.', 'warning');
          return;
      }

      if (!window.confirm('¿Seguro que deseas iniciar el evento ahora? Empezará a correr el tiempo.')) return;
      
      setIsManaging(true);
      try {
          await birthdayService.cambiarEstado(selectedEvento.id, 'en_curso');
          const ahora = new Date();
          const year = ahora.getFullYear();
          const month = String(ahora.getMonth() + 1).padStart(2, '0');
          const day = String(ahora.getDate()).padStart(2, '0');
          const horas = String(ahora.getHours()).padStart(2, '0');
          const minutos = String(ahora.getMinutes()).padStart(2, '0');
          const fechaActual = `${year}-${month}-${day}`;
          const horaActual = `${horas}:${minutos}`;

          const updated = eventos.map(ev => ev.id === selectedEvento.id ? { ...ev, estado: 'en_curso' as const, fecha_evento: fechaActual, hora_inicio: horaActual } : ev);
          setEventos(updated);
          setSelectedEvento({ ...selectedEvento, estado: 'en_curso', fecha_evento: fechaActual, hora_inicio: horaActual });
          showToast('Evento iniciado correctamente', 'success');
      } catch (err) {
          showToast('Error al iniciar evento', 'error');
      } finally {
          setIsManaging(false);
      }
  };

  const handleAddGuest = async () => {
    if (!selectedEvento) return;
    if (!newGuestName.trim()) {
      showToast('Por favor ingresa el nombre del niño', 'warning');
      return;
    }
    const pkgId = newGuestPackageId || selectedEvento.paquete_id;
    if (!pkgId) {
      showToast('Por favor selecciona un paquete', 'warning');
      return;
    }
    const selectedPkg = paquetesPrivados.find(p => p.id === pkgId);
    const cost = selectedPkg ? selectedPkg.precio : selectedEvento.precio_por_nino;

    setIsManaging(true);
    try {
      await birthdayService.ingresarNino(selectedEvento.id, newGuestName, true, pkgId, cost);
      showToast('Niño registrado con éxito', 'success');
      setNewGuestName('');
      
      // Recargar niños
      const updated = await birthdayService.getDetallesEvento(selectedEvento.id);
      setNinosCumple(updated);
      setTotalNinos(updated.length);
    } catch (err) {
      console.error(err);
      showToast('Error al registrar al niño', 'error');
    } finally {
      setIsManaging(false);
    }
  };

  const handleDeleteGuest = async (ninoId: string, refresco_entregado: boolean, nombre: string) => {
    if (!selectedEvento) return;
    if (!window.confirm(`¿Seguro que deseas eliminar a ${nombre} de la lista de invitados?`)) return;
    setIsManaging(true);
    try {
      await birthdayService.eliminarNino(ninoId, refresco_entregado, nombre);
      showToast('Niño eliminado con éxito', 'success');
      
      // Recargar niños
      const updated = await birthdayService.getDetallesEvento(selectedEvento.id);
      setNinosCumple(updated);
      setTotalNinos(updated.length || 10);
    } catch (err) {
      console.error(err);
      showToast('Error al eliminar al niño', 'error');
    } finally {
      setIsManaging(false);
    }
  };

  const openLiquidarModal = () => {
      setShowLiquidar(true);
      if (selectedEvento) {
          const paqueteSeleccionado = getEventPackageInfo(selectedEvento);
          if (paqueteSeleccionado?.nombre.toLowerCase().includes('comida')) {
              const refresco = inventory.find(i => i.nombre.toLowerCase().includes('refresco') || i.categoria.toLowerCase().includes('refresco'));
              if (refresco) {
                  setBebidasIncluidas([{ item: refresco, qty: totalNinos }]);
              }
          }
      }
  };

  const agregarBebidaIncluida = (item: StockItem) => {
      setBebidasIncluidas(prev => {
          const exists = prev.find(e => e.item.id === item.id);
          if (exists) {
              return prev.map(e => e.item.id === item.id ? { ...e, qty: e.qty + 1 } : e);
          }
          return [...prev, { item, qty: 1 }];
      });
      setSearchIncluido('');
  };

  const quitarBebidaIncluida = (itemId: string) => {
      setBebidasIncluidas(prev => prev.filter(e => e.item.id !== itemId));
  };

  const updateBebidaIncluidaQty = (itemId: string, newQty: number) => {
      if (newQty < 1) return;
      setBebidasIncluidas(prev => prev.map(e => e.item.id === itemId ? { ...e, qty: newQty } : e));
  };

  const saveExtrasToLocalStorage = (newExtras: { item: StockItem, qty: number }[], eventId: string) => {
      if (eventId) {
          if (newExtras.length > 0) {
              localStorage.setItem(`cumpleanos_extras_${eventId}`, JSON.stringify(newExtras));
          } else {
              localStorage.removeItem(`cumpleanos_extras_${eventId}`);
          }
      }
  };

  const agregarExtra = (item: StockItem) => {
      if (!selectedEvento) return;
      setExtras(prev => {
          const exists = prev.find(e => e.item.id === item.id);
          let updated;
          if (exists) {
              updated = prev.map(e => e.item.id === item.id ? { ...e, qty: e.qty + 1 } : e);
          } else {
              updated = [...prev, { item, qty: 1 }];
          }
          saveExtrasToLocalStorage(updated, selectedEvento.id);
          return updated;
      });
      setSearchItem('');
  };

  const quitarExtra = (itemId: string) => {
      if (!selectedEvento) return;
      setExtras(prev => {
          const updated = prev.filter(e => e.item.id !== itemId);
          saveExtrasToLocalStorage(updated, selectedEvento.id);
          return updated;
      });
  };

  const updateExtraQty = (itemId: string, newQty: number) => {
      if (newQty < 1) return;
      if (!selectedEvento) return;
      setExtras(prev => {
          const updated = prev.map(e => e.item.id === itemId ? { ...e, qty: newQty } : e);
          saveExtrasToLocalStorage(updated, selectedEvento.id);
          return updated;
      });
  };

  const calcularSubtotalNinos = () => {
      if (!selectedEvento) return 0;
      let subtotal = 0;
      if (ninosCumple.length > 0) {
          subtotal += ninosCumple.reduce((sum, n) => {
              const cost = n.costo_unitario ?? selectedEvento.precio_por_nino;
              return sum + cost;
          }, 0);
          
          if (totalNinos > ninosCumple.length) {
              const extraKids = totalNinos - ninosCumple.length;
              subtotal += extraKids * selectedEvento.precio_por_nino;
          }
      } else {
          subtotal += totalNinos * selectedEvento.precio_por_nino;
      }
      return subtotal;
  };

  const calcularTotalPagar = () => {
      if (!selectedEvento) return 0;
      const subtotalNinos = calcularSubtotalNinos();
      const subtotalExtras = extras.reduce((sum, e) => sum + (e.item.precio_venta * e.qty), 0);
      return Math.max(0, (subtotalNinos + subtotalExtras) - selectedEvento.anticipo_pagado);
  };

  const handleLiquidarFinal = async () => {
      if (!selectedEvento) return;
      
      const total_final = calcularTotalPagar();

      setIsManaging(true);
      try {
          // 1. Descontar bebidas incluidas
          for (const bebida of bebidasIncluidas) {
              await stockService.recordMovement(bebida.item.id, bebida.qty, 'salida', `Consumo incluido cumpleaños`);
          }

          // 2. Descontar extras del inventario
          for (const extra of extras) {
              await stockService.recordMovement(extra.item.id, extra.qty, 'salida', `Venta extra en Cumpleaños - ${selectedEvento.nombre_festejado}`);
          }

          // 3. Liquidar el evento (Guardando el costo total real del evento en BD)
          const { getActiveSession } = await import('../../lib/treasuryService');
          const activeSession = await getActiveSession();
          const arqueoId = activeSession?.id;

          const extrasLiquidados = extras.map(e => ({
              nombre: e.item.nombre,
              cantidad: e.qty,
              precio: e.item.precio_venta,
              total: e.item.precio_venta * e.qty
          }));

          const costo_total_evento = calcularSubtotalNinos() + extras.reduce((sum, e) => sum + (e.item.precio_venta * e.qty), 0);
          await birthdayService.cambiarEstado(selectedEvento.id, 'liquidado', costo_total_evento, arqueoId, extrasLiquidados, totalNinos);
          
          // Clear saved extras from localStorage
          localStorage.removeItem(`cumpleanos_extras_${selectedEvento.id}`);

          // 4. Registrar transacción financiera
          if (total_final > 0) {
              if (metodoPagoLiquidacion === 'Mixto') {
                  const efectivo = Number(montoEfectivo) || 0;
                  const tarjeta = Number(montoTarjeta) || 0;
                  if (efectivo > 0) {
                      await birthdayService.registrarTransaccionFinanciera(efectivo, 'Efectivo', selectedEvento.paquete_id, `Liquidación final (Mixto - Efectivo) cumpleaños (Festejado: ${selectedEvento.nombre_festejado})`);
                  }
                  if (tarjeta > 0) {
                      await birthdayService.registrarTransaccionFinanciera(tarjeta, 'Tarjeta', selectedEvento.paquete_id, `Liquidación final (Mixto - Tarjeta) cumpleaños (Festejado: ${selectedEvento.nombre_festejado})`);
                  }
              } else {
                  await birthdayService.registrarTransaccionFinanciera(total_final, metodoPagoLiquidacion, selectedEvento.paquete_id, `Liquidación final de cumpleaños (Festejado: ${selectedEvento.nombre_festejado})`);
              }
          }
          
          // 5. Imprimir Ticket de Liquidación
          try {
              const settings = JSON.parse(localStorage.getItem('printer_settings') || '{}');
              if (settings.ticketPrinter?.address) {
                  const ticketItems: any[] = [];
                  if (ninosCumple.length > 0) {
                      ninosCumple.forEach(n => {
                          ticketItems.push({
                              nino: n.nombre_nino,
                              nombre: n.paquetes?.nombre || 'Paquete Cumpleaños',
                              precio: n.costo_unitario ?? selectedEvento.precio_por_nino
                          });
                      });
                      if (totalNinos > ninosCumple.length) {
                          ticketItems.push({
                              nino: 'Extra(s)',
                              nombre: `${totalNinos - ninosCumple.length} niño(s) extra(s) base`,
                              precio: (totalNinos - ninosCumple.length) * selectedEvento.precio_por_nino
                          });
                      }
                  } else {
                      ticketItems.push({
                          nino: selectedEvento.nombre_festejado,
                          nombre: `Paquete Base (${totalNinos} niños)`,
                          precio: totalNinos * selectedEvento.precio_por_nino
                      });
                  }

                  const ticketAccesorios = extras.map(e => ({
                      cantidad: e.qty,
                      concepto: e.item.nombre,
                      pUnit: e.item.precio_venta,
                      importe: e.item.precio_venta * e.qty
                  }));

                  const subtotalReal = calcularSubtotalNinos() + extras.reduce((sum, e) => sum + (e.item.precio_venta * e.qty), 0);

                  const ticketData = {
                      folio: `CUMPLE-${selectedEvento.id.substring(0, 8).toUpperCase()}`,
                      cliente: selectedEvento.nombre_cliente,
                      telefono: selectedEvento.telefono_cliente,
                      items: ticketItems,
                      accesorios: ticketAccesorios,
                      subtotal: subtotalReal,
                      iva: 0,
                      total: subtotalReal,
                      paymentMethod: metodoPagoLiquidacion === 'Mixto' 
                          ? `Mixto (Efe: $${montoEfectivo} Tar: $${montoTarjeta})` 
                          : metodoPagoLiquidacion,
                      mensaje: `Liquidacion de evento de ${selectedEvento.nombre_festejado}\nAnticipo Aplicado: -$${selectedEvento.anticipo_pagado.toFixed(2)}\nCobrado Hoy: $${total_final.toFixed(2)}\n¡Gracias por celebrar con nosotros!`
                  };

                  const original = PrinterService.formatEpsonTicket(ticketData as any, false);
                  const copia = PrinterService.formatEpsonTicket(ticketData as any, true);

                  await PrinterService.printRaw(original, 'TICKET');
                  await PrinterService.printRaw(copia, 'TICKET');
                  showToast('Vouchers de liquidación impresos.', 'success');
              }
          } catch (printErr) {
              console.error("Error al imprimir ticket de liquidación:", printErr);
              showToast('No se pudo imprimir el comprobante de liquidación.', 'warning');
          }
          
          showToast(`Evento liquidado. Se registraron ${totalNinos} niños.`, 'success');
          setSelectedEvento(null);
          loadData();
      } catch (err) {
          showToast('Error al liquidar', 'error');
          console.error(err);
      } finally {
          setIsManaging(false);
      }
  };

  const handleCreateSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const packageId = formData.get('paquete_id') as string;
    const selectedPkg = paquetesPrivados.find(p => p.id === packageId);
    
    const evento = {
        nombre_festejado: formData.get('nombre_festejado') as string,
        nombre_cliente: formData.get('nombre_cliente') as string,
        telefono_cliente: (formData.get('telefono_cliente') as string).replace(/\D/g, ''),
        fecha_evento: formData.get('fecha_evento') as string,
        hora_inicio: formData.get('hora_inicio') as string,
        anticipo_pagado: parseFloat(formData.get('anticipo_pagado') as string) || 0,
        metodo_pago_anticipo: formData.get('metodo_pago_anticipo') as string,
        precio_por_nino: selectedPkg ? selectedPkg.precio : 0,
        paquete_id: packageId || undefined,
        area: selectedPkg ? selectedPkg.area : undefined
    };

    setIsSubmitting(true);
    try {
        await birthdayService.createEvento(evento);
        
        // Print ticket for advance payment
        if (evento.anticipo_pagado > 0) {
            try {
                const settings = JSON.parse(localStorage.getItem('printer_settings') || '{}');
                if (settings.ticketPrinter?.address) {
                    const ticketData = {
                        folio: 'ANTICIPO',
                        cliente: evento.nombre_cliente,
                        telefono: evento.telefono_cliente,
                        items: [{
                            nino: evento.nombre_festejado,
                            nombre: `Anticipo Evento (${evento.fecha_evento})`,
                            precio: evento.anticipo_pagado
                        }],
                        subtotal: evento.anticipo_pagado,
                        iva: 0,
                        total: evento.anticipo_pagado,
                        paymentMethod: evento.metodo_pago_anticipo,
                        mensaje: `Anticipo para evento de ${evento.nombre_festejado}`
                    };
                    const original = PrinterService.formatEpsonTicket(ticketData as any, false);
                    const copia = PrinterService.formatEpsonTicket(ticketData as any, true);
                    
                    await PrinterService.printRaw(original, 'TICKET');
                    await PrinterService.printRaw(copia, 'TICKET');
                    showToast('Vouchers de anticipo impresos.', 'success');
                }
            } catch (printErr) {
                console.error("Error al imprimir ticket:", printErr);
                showToast('No se pudo imprimir el comprobante.', 'warning');
            }
        }

        showToast('Cumpleaños agendado correctamente', 'success');
        setShowCreateModal(false);
loadData();
    } catch(err) {
        console.error(err);
        showToast('Error al agendar cumpleaños', 'error');
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '2rem', height: '100%', overflowY: 'auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', color: '#1e293b', margin: 0 }}>
            <FontAwesomeIcon icon={faCakeCandles} style={{ color: '#d946ef', marginRight: '0.75rem' }} />
            Eventos y Cumpleaños
          </h1>
          <p style={{ color: '#64748b', margin: '0.5rem 0 0 0' }}>Calendario de fiestas infantiles y control de áreas.</p>
        </div>
        <button className="btn btn-ghost" onClick={onCancel}>
          <FontAwesomeIcon icon={faTimes} /> Cerrar
        </button>
      </header>

      {/* Control de Cabecera: Toggle de Vistas y Nuevo Cumpleaños */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <button 
            onClick={() => setViewMode('calendar')} 
            style={{ 
              padding: '0.5rem 1rem', 
              borderRadius: '6px', 
              border: 'none', 
              background: viewMode === 'calendar' ? '#fff' : 'transparent', 
              fontWeight: viewMode === 'calendar' ? 'bold' : 'normal',
              color: viewMode === 'calendar' ? '#7c3aed' : '#64748b',
              boxShadow: viewMode === 'calendar' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s'
            }}
          >
            📅 Calendario
          </button>
          <button 
            onClick={() => setViewMode('list')} 
            style={{ 
              padding: '0.5rem 1rem', 
              borderRadius: '6px', 
              border: 'none', 
              background: viewMode === 'list' ? '#fff' : 'transparent', 
              fontWeight: viewMode === 'list' ? 'bold' : 'normal',
              color: viewMode === 'list' ? '#7c3aed' : '#64748b',
              boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s'
            }}
          >
            📋 Lista Activos
          </button>
        </div>
        <button className="btn btn-primary" onClick={openCreateModalNormal}>
          <FontAwesomeIcon icon={faPlus} /> Nuevo Cumpleaños
        </button>
      </div>

      {isLoading ? (
        <p>Cargando eventos...</p>
      ) : viewMode === 'list' ? (
        /* VISTA LISTA DE EVENTOS ACTIVOS */
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
           {eventos.filter(ev => ev.estado === 'agendado' || ev.estado === 'en_curso').length === 0 ? (
               <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                   No hay eventos activos o programados próximos.
               </div>
           ) : (
               eventos
                .filter(ev => ev.estado === 'agendado' || ev.estado === 'en_curso')
                .map(ev => {
                    const pkgInfo = getEventPackageInfo(ev);
                    return (
                        <div key={ev.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', cursor: 'pointer', transition: 'transform 0.2s' }} onClick={() => openEvento(ev)}>
                            <h3 style={{ margin: '0 0 0.5rem 0' }}>{ev.nombre_festejado}</h3>
                            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>{ev.fecha_evento} a las {ev.hora_inicio.substring(0, 5)}</p>
                            <p style={{ margin: '0.25rem 0 0 0', color: '#7c3aed', fontSize: '0.8rem', fontWeight: 500 }}>📍 Área: {ev.area || pkgInfo?.area || 'Mundo de Pekes'}</p>
                            <div style={{ marginTop: '1rem', borderTop: '1px solid #f1f5f9', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.85rem' }}>Anticipo: <strong>${ev.anticipo_pagado}</strong></span>
                                <span style={{ 
                                    fontWeight: 'bold', 
                                    fontSize: '0.75rem', 
                                    padding: '0.25rem 0.5rem', 
                                    borderRadius: '50px', 
                                    background: ev.estado === 'en_curso' ? '#dcfce7' : '#f3e8ff',
                                    color: ev.estado === 'en_curso' ? '#166534' : '#6b21a8'
                                }}>
                                    {ev.estado.toUpperCase()}
                                </span>
                            </div>
                            {ev.estado === 'en_curso' && (
                                <BirthdayProgressBar 
                                    fechaInicio={ev.fecha_evento} 
                                    horaInicio={ev.hora_inicio} 
                                    duracionMinutos={pkgInfo?.duracion_minutos || 120} 
                                />
                            )}
                        </div>
                    );
                })
           )}
        </div>
      ) : (
        /* VISTA CALENDARIO MENSUAL PREMIUM */
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 0.7fr)', gap: '2rem', alignItems: 'start' }}>
          {/* Lado Izquierdo: Cuadrícula del Calendario */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <button onClick={prevMonth} style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', color: '#1e293b' }}>&lt;</button>
                <h2 style={{ margin: 0, fontSize: '1.2rem', textTransform: 'capitalize', color: '#1e293b', fontWeight: 'bold' }}>
                   {currentMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                </h2>
                <button onClick={nextMonth} style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', color: '#1e293b' }}>&gt;</button>
             </div>
             
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px' }}>
                {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
                   <div key={d} style={{ textAlign: 'center', padding: '0.5rem 0', fontWeight: 'bold', fontSize: '0.85rem', color: '#64748b', background: '#f8fafc', borderRadius: '6px' }}>
                      {d}
                   </div>
                ))}
                
                {getDaysInMonth(currentMonth).map(({ date, isCurrentMonth }, idx) => {
                   const dayEvents = getEventsForDay(date);
                   const isSelected = isSameDay(formatDateString(date), selectedDate);
                   const isToday = isSameDay(formatDateString(date), new Date());
                   
                   return (
                      <div 
                         key={idx} 
                         onClick={() => setSelectedDate(date)}
                         style={{ 
                            minHeight: '80px', 
                            background: isSelected ? '#faf5ff' : isCurrentMonth ? '#fff' : '#f8fafc', 
                            border: isSelected ? '2px solid #a855f7' : '1px solid #e2e8f0', 
                            borderRadius: '8px', 
                            padding: '0.4rem', 
                            cursor: 'pointer', 
                            position: 'relative',
                            transition: 'all 0.15s',
                            opacity: isCurrentMonth ? 1 : 0.5,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            boxShadow: isSelected ? '0 4px 6px -1px rgba(168,85,247,0.1)' : 'none'
                         }}
                      >
                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ 
                               fontSize: '0.85rem', 
                               fontWeight: isToday || isSelected ? 'bold' : 'normal',
                               color: isToday ? '#d946ef' : isSelected ? '#7c3aed' : '#334155',
                               background: isToday ? '#fdf2ff' : 'transparent',
                               padding: isToday ? '2px 6px' : '0',
                               borderRadius: '4px'
                            }}>
                               {date.getDate()}
                            </span>
                            {isToday && <span style={{ fontSize: '0.65rem', color: '#d946ef', fontWeight: 'bold' }}>Hoy</span>}
                         </div>
                         
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px', overflow: 'hidden' }}>
                            {dayEvents.slice(0, 3).map(ev => {
                               let badgeColor = '#94a3b8';
                               let textColor = '#475569';
                               if (ev.estado === 'en_curso') { badgeColor = '#dcfce7'; textColor = '#15803d'; }
                               else if (ev.estado === 'agendado') { badgeColor = '#f3e8ff'; textColor = '#6b21a8'; }
                               else if (ev.estado === 'liquidado') { badgeColor = '#e0f2fe'; textColor = '#0369a1'; }
                               
                               const pkgInfo = getEventPackageInfo(ev);
                               const areaName = ev.area || pkgInfo?.area || 'PEKES';
                               const areaAbbr = areaName.length > 5 ? areaName.substring(0, 5) : areaName;
                               
                               return (
                                  <div 
                                     key={ev.id} 
                                     title={`${ev.nombre_festejado} - ${areaName} a las ${ev.hora_inicio.substring(0, 5)}`}
                                     style={{ 
                                        fontSize: '0.65rem', 
                                        padding: '2px 4px', 
                                        borderRadius: '4px', 
                                        background: badgeColor, 
                                        color: textColor,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        fontWeight: '500'
                                     }}
                                  >
                                     {ev.hora_inicio.substring(0, 5)} {ev.nombre_festejado} ({areaAbbr}.)
                                  </div>
                               );
                            })}
                            {dayEvents.length > 3 && (
                               <div style={{ fontSize: '0.6rem', color: '#64748b', textAlign: 'center', fontWeight: 'bold' }}>
                                  +{dayEvents.length - 3} más
                               </div>
                            )}
                         </div>
                      </div>
                   );
                })}
             </div>
          </div>
          
          {/* Lado Derecho: Detalles del Día Seleccionado */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', minHeight: '350px', display: 'flex', flexDirection: 'column' }}>
             <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem', fontWeight: 'bold' }}>
                📅 Reservas del {selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
             </h3>
             
             <div style={{ flex: 1, overflowY: 'auto' }}>
                {getEventsForDay(selectedDate).length === 0 ? (
                   <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', textAlign: 'center', padding: '2rem 1rem' }}>
                      <span style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎈</span>
                      <p style={{ margin: 0, fontSize: '0.9rem' }}>No hay reservas agendadas para esta fecha.</p>
                      <button 
                         onClick={() => openCreateModalWithDate(formatDateString(selectedDate))}
                         className="btn btn-primary" 
                         style={{ marginTop: '1rem', padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                      >
                         Reservar Ahora
                      </button>
                   </div>
                ) : (
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {getEventsForDay(selectedDate).map(ev => {
                         const pkgInfo = getEventPackageInfo(ev);
                         const area = ev.area || pkgInfo?.area || 'Sin especificar';
                         const dur = pkgInfo?.duracion_minutos || 120;
                         
                         // Calcular hora fin
                         const [h, m] = ev.hora_inicio.split(':').map(Number);
                         const endMins = h * 60 + m + dur;
                         const endH = Math.floor(endMins / 60);
                         const endM = endMins % 60;
                         const endTimeStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
                         
                         let color = '#3b82f6';
                         let bg = '#eff6ff';
                         if (ev.estado === 'en_curso') { color = '#10b981'; bg = '#ecfdf5'; }
                         else if (ev.estado === 'liquidado') { color = '#6b7280'; bg = '#f9fafb'; }
                         else if (ev.estado === 'cancelado') { color = '#ef4444'; bg = '#fef2f2'; }
                         
                         return (
                            <div 
                               key={ev.id} 
                               onClick={() => openEvento(ev)}
                               style={{ 
                                  border: `1px solid ${color}50`, 
                                  background: bg,
                                  borderRadius: '12px', 
                                  padding: '1rem', 
                                  cursor: 'pointer',
                                  transition: 'transform 0.15s',
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                               }}
                               onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                               onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                            >
                               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <h4 style={{ margin: '0 0 0.25rem 0', color: '#1e293b', fontSize: '0.95rem', fontWeight: 'bold' }}>{ev.nombre_festejado}</h4>
                                  <span style={{ 
                                     fontSize: '0.7rem', 
                                     fontWeight: 'bold', 
                                     padding: '2px 8px', 
                                     borderRadius: '50px', 
                                     background: ev.estado === 'en_curso' ? '#dcfce7' : ev.estado === 'agendado' ? '#f3e8ff' : '#f1f5f9',
                                     color: ev.estado === 'en_curso' ? '#15803d' : ev.estado === 'agendado' ? '#6b21a8' : '#475569'
                                  }}>
                                     {ev.estado.toUpperCase()}
                                  </span>
                                </div>
                               
                               <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: '#64748b' }}>
                                  Cliente: <strong>{ev.nombre_cliente}</strong>
                               </p>
                               
                               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.75rem', color: '#475569' }}>
                                  <div>⏰ {ev.hora_inicio.substring(0, 5)} - {endTimeStr}</div>
                                  <div>📍 {area}</div>
                                  <div>💰 Anticipo: ${ev.anticipo_pagado}</div>
                                  <div>🧒 Costo: ${ev.precio_por_nino}/niño</div>
                               </div>
                            </div>
                         );
                      })}
                      
                      <button 
                         onClick={() => openCreateModalWithDate(formatDateString(selectedDate))}
                         className="btn btn-ghost" 
                         style={{ marginTop: '0.5rem', width: '100%', border: '1px dashed #cbd5e1', padding: '0.75rem' }}
                      >
                         + Agendar otro evento este día
                      </button>
                   </div>
                )}
             </div>
          </div>
        </div>
      )}

      {/* MODAL PARA CREAR / AGENDAR CUMPLEANOS */}
      {showCreateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', borderRadius: '12px', width: '90%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto', padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 'bold' }}>Agendar Cumpleaños</h2>
                    <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}><FontAwesomeIcon icon={faTimes} /></button>
                </div>
                <form onSubmit={handleCreateSubmit} style={{ display: 'grid', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.9rem' }}>Nombre del Festejado</label>
                        <input type="text" name="nombre_festejado" required style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.9rem' }}>Nombre del Cliente (Tutor)</label>
                        <input type="text" name="nombre_cliente" required style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.9rem' }}>Teléfono</label>
                        <input 
                            type="tel" 
                            name="telefono_cliente" 
                            value={formatPhone(telefonoInput)}
                            onChange={(e) => setTelefonoInput(e.target.value)}
                            placeholder="(555) 123-4567" 
                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} 
                        />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.9rem' }}>Fecha del Evento</label>
                            <input 
                                type="date" 
                                name="fecha_evento" 
                                value={formFecha}
                                onChange={(e) => setFormFecha(e.target.value)}
                                required 
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} 
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.9rem' }}>Hora de Inicio</label>
                            <input 
                                type="time" 
                                name="hora_inicio" 
                                value={formHora}
                                onChange={(e) => setFormHora(e.target.value)}
                                required 
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} 
                            />
                        </div>
                    </div>
                    
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.9rem' }}>Paquete de Cumpleaños</label>
                        <select 
                            name="paquete_id" 
                            value={formPaqueteId} 
                            onChange={(e) => setFormPaqueteId(e.target.value)}
                            required 
                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff' }}
                        >
                            <option value="">-- Selecciona el Paquete --</option>
                            {Object.entries(
                                paquetesPrivados.reduce((acc, p) => {
                                    const isComida = p.nombre.toLowerCase().includes('comida');
                                    const groupName = isComida ? `${p.area} (Con Comida)` : p.area;
                                    if (!acc[groupName]) acc[groupName] = [];
                                    acc[groupName].push(p);
                                    return acc;
                                }, {} as Record<string, typeof paquetesPrivados>)
                            ).map(([area, pkgs]) => (
                                <optgroup key={area} label={area}>
                                    {pkgs.sort((a, b) => a.duracion_minutos - b.duracion_minutos).map(p => (
                                        <option key={p.id} value={p.id}>{p.nombre} (${p.precio}) - Duración: {p.duracion_minutos}min</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </div>

                    {/* VALIDADOR DE TRASLAPES EN TIEMPO REAL */}
                    {conflict ? (
                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.75rem', color: '#b91c1c', fontSize: '0.85rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                            <span style={{ fontSize: '1.1rem' }}>⚠️</span>
                            <div>
                                <strong>Conflicto de área:</strong> La zona <strong>{conflict.area}</strong> ya está reservada para el evento de <strong>{conflict.festejado}</strong> de <strong>{conflict.hora_inicio.substring(0, 5)}</strong> a <strong>{conflict.hora_fin}</strong> en esta fecha.
                            </div>
                        </div>
                    ) : formFecha && formHora && formPaqueteId ? (
                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.75rem', color: '#166534', fontSize: '0.85rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                            <span>✅</span>
                            <div>
                                <strong>Zona y horario disponibles:</strong> El área está libre para agendar el evento.
                            </div>
                        </div>
                    ) : null}
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.9rem' }}>Anticipo Pagado ($)</label>
                            <input type="number" step="0.01" min="0" name="anticipo_pagado" defaultValue="" placeholder="0.00" onFocus={(e) => e.target.select()} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.9rem' }}>Método de Pago (Anticipo)</label>
                            <select name="metodo_pago_anticipo" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff' }}>
                                <option value="efectivo">Efectivo</option>
                                <option value="tarjeta">Tarjeta (Crédito/Débito)</option>
                                <option value="transferencia">Transferencia</option>
                            </select>
                        </div>
                    </div>
                    <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-ghost">Cancelar</button>
                        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Guardando...' : 'Agendar Cumpleaños'}</button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* GESTIÓN DE EVENTO SELECCIONADO (INICIAR/LIQUIDAR) */}
      {selectedEvento && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', borderRadius: '12px', width: '90%', maxWidth: '600px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#0f172a', fontWeight: 'bold' }}>Gestión: {selectedEvento.nombre_festejado}</h2>
                        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Tutor: {selectedEvento.nombre_cliente} | Anticipo: ${selectedEvento.anticipo_pagado} | Pekes Ingresados: {ninosCumple.length} | Costo Acumulado: ${ninosCumple.reduce((sum, n) => sum + (n.costo_unitario ?? selectedEvento.precio_por_nino), 0).toFixed(2)}</span>
                    </div>
                    <button onClick={() => setSelectedEvento(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#64748b' }}><FontAwesomeIcon icon={faTimes} /></button>
                </div>
                
                <div style={{ padding: '1.5rem', flex: 1, overflowY: 'auto' }}>
                    {isEditing ? (
                        <form onSubmit={handleEditSubmit} style={{ display: 'grid', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.9rem' }}>Nombre del Festejado</label>
                                <input type="text" name="nombre_festejado" required defaultValue={selectedEvento.nombre_festejado} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.9rem' }}>Nombre del Cliente (Tutor)</label>
                                <input type="text" name="nombre_cliente" required defaultValue={selectedEvento.nombre_cliente} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.9rem' }}>Teléfono</label>
                                <input 
                                    type="tel" 
                                    name="telefono_cliente" 
                                    value={formatPhone(telefonoInput)}
                                    onChange={(e) => setTelefonoInput(e.target.value)}
                                    placeholder="(555) 123-4567" 
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} 
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.9rem' }}>Fecha del Evento</label>
                                    <input 
                                        type="date" 
                                        name="fecha_evento" 
                                        value={formFecha}
                                        onChange={(e) => setFormFecha(e.target.value)}
                                        required 
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} 
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.9rem' }}>Hora de Inicio</label>
                                    <input 
                                        type="time" 
                                        name="hora_inicio" 
                                        value={formHora}
                                        onChange={(e) => setFormHora(e.target.value)}
                                        required 
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} 
                                    />
                                </div>
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.9rem' }}>Paquete de Cumpleaños</label>
                                <select 
                                    name="paquete_id" 
                                    value={formPaqueteId} 
                                    onChange={(e) => setFormPaqueteId(e.target.value)}
                                    required 
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff' }}
                                >
                                    <option value="">-- Selecciona el Paquete --</option>
                                    {Object.entries(
                                        paquetesPrivados.reduce((acc, p) => {
                                            const isComida = p.nombre.toLowerCase().includes('comida');
                                            const groupName = isComida ? `${p.area} (Con Comida)` : p.area;
                                            if (!acc[groupName]) acc[groupName] = [];
                                            acc[groupName].push(p);
                                            return acc;
                                        }, {} as Record<string, typeof paquetesPrivados>)
                                    ).map(([area, pkgs]) => (
                                        <optgroup key={area} label={area}>
                                            {pkgs.sort((a, b) => a.duracion_minutos - b.duracion_minutos).map(p => (
                                                <option key={p.id} value={p.id}>{p.nombre} (${p.precio}) - Duración: {p.duracion_minutos}min</option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                            </div>

                            {/* VALIDADOR DE TRASLAPES EN TIEMPO REAL */}
                            {conflict ? (
                                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.75rem', color: '#b91c1c', fontSize: '0.85rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '1.1rem' }}>⚠️</span>
                                    <div>
                                        <strong>Conflicto de área:</strong> La zona <strong>{conflict.area}</strong> ya está reservada para el evento de <strong>{conflict.festejado}</strong> de <strong>{conflict.hora_inicio.substring(0, 5)}</strong> a <strong>{conflict.hora_fin}</strong> en esta fecha.
                                    </div>
                                </div>
                            ) : formFecha && formHora && formPaqueteId ? (
                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.75rem', color: '#166534', fontSize: '0.85rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                                    <span>✅</span>
                                    <div>
                                        <strong>Zona y horario disponibles:</strong> El área está libre para agendar el evento.
                                    </div>
                                </div>
                            ) : null}
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.9rem' }}>Anticipo Pagado ($)</label>
                                    <input type="number" step="0.01" min="0" name="anticipo_pagado" defaultValue={selectedEvento.anticipo_pagado} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.9rem' }}>Método de Pago (Anticipo)</label>
                                    <select name="metodo_pago_anticipo" defaultValue={selectedEvento.metodo_pago_anticipo} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff' }}>
                                        <option value="efectivo">Efectivo</option>
                                        <option value="tarjeta">Tarjeta (Crédito/Débito)</option>
                                    </select>
                                </div>
                            </div>
                            <div style={{ marginTop: '1rem', display: 'flex', gap: '1.5rem', justifyContent: 'flex-end' }}>
                                <button type="button" onClick={() => setIsEditing(false)} className="btn btn-ghost">Cancelar</button>
                                <button type="submit" className="btn btn-primary" disabled={isSubmitting || !!conflict}>{isSubmitting ? 'Guardando...' : 'Guardar Cambios'}</button>
                            </div>
                        </form>
                    ) : !showLiquidar ? (
                        <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                            {selectedEvento.estado === 'agendado' ? (
                                <>
                                    <div style={{ marginBottom: '2rem', color: '#64748b' }}>
                                        <p>El evento está programado para el <strong>{selectedEvento.fecha_evento}</strong> a las <strong>{selectedEvento.hora_inicio.substring(0, 5)}</strong>.</p>
                                        <p>Cuando el festejado y sus invitados lleguen, inicia el evento.</p>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                                        <button onClick={handleIniciarEvento} className="btn btn-primary" style={{ padding: '1rem 2rem', fontSize: '1.2rem', background: '#3b82f6', width: '250px' }} disabled={isManaging}>
                                            <FontAwesomeIcon icon={faPlay} style={{ marginRight: '8px' }} /> Iniciar Evento
                                        </button>
                                        
                                        {user.role !== 'cajero' && (
                                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                                                <button onClick={startEditing} className="btn btn-secondary" style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                                                    ✏️ Editar Información
                                                </button>
                                                <button onClick={handleCancelarEvento} className="btn btn-danger" style={{ background: '#ef4444', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                                                    ❌ Cancelar Evento
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div style={{ marginBottom: '2rem' }}>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#16a34a', marginBottom: '0.5rem' }}>
                                            🟢 Evento en Curso
                                        </div>
                                        <p style={{ color: '#64748b' }}>El tiempo está corriendo según la duración del paquete.</p>
                                        <BirthdayProgressBar 
                                            fechaInicio={selectedEvento.fecha_evento} 
                                            horaInicio={selectedEvento.hora_inicio} 
                                            duracionMinutos={getEventPackageInfo(selectedEvento)?.duracion_minutos || 120} 
                                        />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                                        <button onClick={openLiquidarModal} className="btn btn-primary" style={{ padding: '1rem 2rem', fontSize: '1.2rem', background: '#16a34a', width: '250px' }}>
                                            <FontAwesomeIcon icon={faCheck} style={{ marginRight: '8px' }} /> Finalizar y Liquidar
                                        </button>
                                        
                                        {user.role !== 'cajero' && (
                                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                                                <button onClick={startEditing} className="btn btn-secondary" style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                                                    ✏️ Editar Información
                                                </button>
                                                <button onClick={handleReiniciarTiempo} className="btn btn-secondary" style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                                                    ⏰ Reiniciar Tiempo
                                                </button>
                                                <button onClick={handleCancelarEvento} className="btn btn-danger" style={{ background: '#ef4444', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }} disabled={isManaging}>
                                                    ❌ Cancelar Evento
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* SECCIÓN: Registro de Niños Invitados (Pekes) */}
                                    <div style={{ marginTop: '2rem', borderTop: '2px dashed #cbd5e1', paddingTop: '1.5rem', textAlign: 'left' }}>
                                        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: '#1e293b', fontWeight: 'bold' }}>
                                            🧒 Registro de Niños Invitados (Pekes)
                                        </h3>

                                        {/* Botón para abrir modal de ingreso */}
                                        <div style={{ marginBottom: '1.25rem' }}>
                                            <button 
                                                type="button"
                                                onClick={() => {
                                                    setNewGuestName('');
                                                    setNewGuestPackageId(selectedEvento.paquete_id || '');
                                                    setShowCheckInModal(true);
                                                }}
                                                className="btn btn-primary"
                                                style={{ 
                                                    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', 
                                                    border: 'none', 
                                                    fontWeight: 800,
                                                    padding: '0.6rem 1.5rem',
                                                    fontSize: '0.9rem',
                                                    boxShadow: '0 4px 12px rgba(124, 58, 237, 0.2)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem'
                                                }}
                                            >
                                                <FontAwesomeIcon icon={faPlus} /> Ingresar Peke
                                            </button>
                                        </div>

                                        {/* Listado de invitados ingresados */}
                                        {ninosCumple.length === 0 ? (
                                            <p style={{ color: '#64748b', fontStyle: 'italic', fontSize: '0.85rem', margin: '0.5rem 0 0 0' }}>No hay pekes registrados en la lista aún.</p>
                                        ) : (
                                            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', padding: '0.5rem', background: '#f8fafc' }}>
                                                <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                                                    {(() => {
                                                        const grouped = ninosCumple.reduce((acc: Record<string, typeof ninosCumple>, n) => {
                                                            const rawArea = n.paquetes?.area || getEventPackageInfo(selectedEvento)?.area || 'Área Base';
                                                            const area = AREA_MAP[rawArea] || rawArea;
                                                            if (!acc[area]) acc[area] = [];
                                                            acc[area].push(n);
                                                            return acc;
                                                        }, {});

                                                        const FIXED_AREA_ORDER = ['Mundo de Pekes', 'Trampolín Park', 'Área Mixta'];
                                                        const sortedEntries = Object.entries(grouped).sort(([areaA], [areaB]) => {
                                                            const idxA = FIXED_AREA_ORDER.indexOf(areaA);
                                                            const idxB = FIXED_AREA_ORDER.indexOf(areaB);
                                                            const valA = idxA === -1 ? 999 : idxA;
                                                            const valB = idxB === -1 ? 999 : idxB;
                                                            return valA - valB;
                                                        });

                                                        return sortedEntries.map(([area, areaGuests]) => (
                                                            <React.Fragment key={area}>
                                                                <div style={{ gridColumn: 'span 2', fontSize: '0.75rem', fontWeight: 800, color: '#7c3aed', background: '#f5f3ff', padding: '4px 10px', borderRadius: '6px', textAlign: 'left', marginTop: '0.25rem', borderLeft: '3px solid #6d28d9' }}>
                                                                    📍 {area} ({areaGuests.length})
                                                                </div>
                                                                {areaGuests.map((n) => {
                                                                    const pkgName = n.paquetes?.nombre || getEventPackageInfo(selectedEvento)?.nombre || 'Paquete Base';
                                                                    const cost = n.costo_unitario ?? selectedEvento.precio_por_nino;
                                                                    return (
                                                                        <div 
                                                                            key={n.id} 
                                                                            style={{ 
                                                                                display: 'flex', 
                                                                                justifyContent: 'space-between',
                                                                                alignItems: 'center', 
                                                                                padding: '8px 12px', 
                                                                                background: '#fff',
                                                                                border: '1px solid #e2e8f0',
                                                                                borderRadius: '8px',
                                                                                fontSize: '0.85rem',
                                                                                gap: '0.5rem'
                                                                            }}
                                                                        >
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, flex: 1, textAlign: 'left' }}>
                                                                                <span style={{ fontWeight: 'bold', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                                                    🧒 {n.nombre_nino}
                                                                                </span>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                                                    <span style={{ fontSize: '0.7rem', color: '#7c3aed', background: '#f5f3ff', padding: '1px 5px', borderRadius: '4px', fontWeight: 500 }}>
                                                                                        {pkgName}
                                                                                    </span>
                                                                                    {pkgName.toLowerCase().includes('comida') && (
                                                                                        <span style={{ fontSize: '0.65rem', color: '#16a34a', background: '#dcfce7', padding: '1px 5px', borderRadius: '4px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                                                            🍔 Comida
                                                                                        </span>
                                                                                    )}
                                                                                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                                                                                        (${Number(cost).toFixed(2)})
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setEditingGuest({ id: n.id, nombre_nino: n.nombre_nino, paquete_id: n.paquete_id || '' })}
                                                                                    style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', padding: '2px' }}
                                                                                    title="Editar paquete"
                                                                                    disabled={isManaging}
                                                                                >
                                                                                    <FontAwesomeIcon icon={faPen} />
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleDeleteGuest(n.id, n.refresco_entregado, n.nombre_nino)}
                                                                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                                                                                    title="Eliminar invitado"
                                                                                    disabled={isManaging}
                                                                                >
                                                                                    <FontAwesomeIcon icon={faTrash} />
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </React.Fragment>
                                                        ));
                                                    })()}
                                                </div>
                                                <div style={{ background: '#f1f5f9', padding: '0.5rem 0.75rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 'bold', borderTop: '1px solid #e2e8f0', color: '#334155' }}>
                                                    <span>Total Invitados: {ninosCumple.length}</span>
                                                    <span>Costo Acumulado: ${ninosCumple.reduce((sum, n) => sum + (n.costo_unitario ?? selectedEvento.precio_por_nino), 0).toFixed(2)}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        <div>
                            <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: '#1e293b', fontWeight: 'bold' }}>Liquidación Final</h3>
                            
                            <div style={{ background: '#f1f5f9', padding: '1.5rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>¿Cuántos niños ingresaron en total?</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <input 
                                        type="number" 
                                        min={ninosCumple.length > 0 ? ninosCumple.length : 1} 
                                        value={totalNinos} 
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value) || 0;
                                            const minVal = ninosCumple.length > 0 ? ninosCumple.length : 1;
                                            setTotalNinos(Math.max(minVal, val));
                                        }}
                                        style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100px', fontSize: '1.2rem', textAlign: 'center', background: '#fff' }}
                                    />
                                    <span style={{ fontSize: '0.9rem', color: '#64748b' }}>
                                        {ninosCumple.length > 0 
                                            ? `*Se registran ${ninosCumple.length} en lista. Si el contrato incluye más niños (ej. mínimo contratado), ingresa la cantidad total aquí para cobrar la diferencia al precio base del paquete ($${selectedEvento.precio_por_nino}/niño).`
                                            : "*Ingresa la cantidad exacta de niños asistentes para el cobro."
                                        }
                                    </span>
                                </div>
                            </div>

                            {getEventPackageInfo(selectedEvento)?.nombre.toLowerCase().includes('comida') && (
                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1.5rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
                                    <h4 style={{ margin: '0 0 0.5rem 0', color: '#166534', fontWeight: 'bold' }}>🥤 Bebidas Incluidas en el Paquete</h4>
                                    <p style={{ fontSize: '0.9rem', color: '#166534', marginTop: 0, marginBottom: '1rem' }}>Estas bebidas se descontarán del inventario, pero <strong>NO</strong> se cobrarán en el total.</p>
                                    
                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                        <input 
                                            type="text" 
                                            placeholder="Buscar bebida incluida..." 
                                            value={searchIncluido}
                                            onChange={(e) => setSearchIncluido(e.target.value)}
                                            style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid #bbf7d0' }}
                                        />
                                    </div>
                                    
                                    {searchIncluido && (
                                        <div style={{ background: '#fff', border: '1px solid #bbf7d0', borderRadius: '8px', maxHeight: '150px', overflowY: 'auto', marginBottom: '1rem' }}>
                                            {inventory.filter(i => i.nombre.toLowerCase().includes(searchIncluido.toLowerCase())).slice(0, 5).map(item => (
                                                <div key={`inc-${item.id}`} style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f0fdf4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span>{item.nombre}</span>
                                                    <button onClick={() => agregarBebidaIncluida(item)} className="btn btn-primary" style={{ padding: '0.25rem 0.75rem', background: '#22c55e' }}>Agregar</button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {bebidasIncluidas.length > 0 && (
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead style={{ background: '#dcfce7', fontSize: '0.85rem', color: '#166534' }}>
                                                <tr>
                                                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Bebida</th>
                                                    <th style={{ padding: '0.5rem', textAlign: 'center' }}>Cant.</th>
                                                    <th></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {bebidasIncluidas.map(e => (
                                                    <tr key={`inc-${e.item.id}`} style={{ borderBottom: '1px solid #dcfce7' }}>
                                                        <td style={{ padding: '0.5rem' }}>{e.item.nombre}</td>
                                                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                                            <input 
                                                                type="number" 
                                                                min="1" 
                                                                value={e.qty} 
                                                                onChange={(evt) => updateBebidaIncluidaQty(e.item.id, parseInt(evt.target.value) || 1)}
                                                                style={{ width: '60px', padding: '0.25rem', textAlign: 'center', borderRadius: '4px', border: '1px solid #bbf7d0' }}
                                                            />
                                                        </td>
                                                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                                            <button onClick={() => quitarBebidaIncluida(e.item.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}><FontAwesomeIcon icon={faTrash} /></button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}

                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '1.5rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
                                <h4 style={{ margin: '0 0 1rem 0', fontWeight: 'bold' }}>Ventas Extras (Refrescos, Aguas, Calcetas)</h4>
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                    <input 
                                        type="text" 
                                        placeholder="Buscar producto extra..." 
                                        value={searchItem}
                                        onChange={(e) => setSearchItem(e.target.value)}
                                        style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    />
                                </div>
                                
                                {searchItem && (
                                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', maxHeight: '150px', overflowY: 'auto', marginBottom: '1rem' }}>
                                        {inventory.filter(i => i.nombre.toLowerCase().includes(searchItem.toLowerCase())).slice(0, 5).map(item => (
                                            <div key={item.id} style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span>{item.nombre} (${item.precio_venta})</span>
                                                <button onClick={() => agregarExtra(item)} className="btn btn-primary" style={{ padding: '0.25rem 0.75rem' }}>Agregar</button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {extras.length > 0 && (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                                        <thead style={{ background: '#f8fafc', fontSize: '0.85rem', color: '#64748b' }}>
                                            <tr>
                                                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Extra</th>
                                                <th style={{ padding: '0.5rem', textAlign: 'center' }}>Cant.</th>
                                                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Subtotal</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {extras.map(e => (
                                                <tr key={e.item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '0.5rem' }}>{e.item.nombre}</td>
                                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                                        <input 
                                                            type="number" 
                                                            min="1" 
                                                            value={e.qty} 
                                                            onChange={(evt) => updateExtraQty(e.item.id, parseInt(evt.target.value) || 1)}
                                                            style={{ width: '60px', padding: '0.25rem', textAlign: 'center', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>${e.item.precio_venta * e.qty}</td>
                                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                                        <button onClick={() => quitarExtra(e.item.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}><FontAwesomeIcon icon={faTrash} /></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                            
                            <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '2px solid #16a34a' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <span style={{ color: '#64748b' }}>
                                        {ninosCumple.length > 0 
                                            ? totalNinos > ninosCumple.length 
                                                ? `Costo Niños (${ninosCumple.length} en lista + ${totalNinos - ninosCumple.length} extras a $${selectedEvento.precio_por_nino})`
                                                : `Costo Niños (${ninosCumple.length} registrados)`
                                            : `Costo Niños (${totalNinos} cobrados x $${selectedEvento.precio_por_nino})`
                                        }
                                    </span>
                                    <strong>${calcularSubtotalNinos().toFixed(2)}</strong>
                                </div>
                                {extras.length > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                        <span style={{ color: '#64748b' }}>Extras</span>
                                        <strong>${extras.reduce((sum, e) => sum + (e.item.precio_venta * e.qty), 0)}</strong>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: '#ef4444' }}>
                                    <span>Anticipo Pagado</span>
                                    <strong>- ${selectedEvento.anticipo_pagado}</strong>
                                </div>
                                <div style={{ borderTop: '1px solid #cbd5e1', margin: '1rem 0' }}></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <span style={{ fontWeight: 'bold', color: '#64748b' }}>Método de Pago Final</span>
                                    <select 
                                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                        value={metodoPagoLiquidacion} 
                                        onChange={(e) => setMetodoPagoLiquidacion(e.target.value)}
                                    >
                                        <option value="Efectivo">Efectivo</option>
                                        <option value="Tarjeta">Tarjeta</option>
                                        <option value="Mixto">Mixto (Dividir Pago)</option>
                                    </select>
                                </div>
                                {metodoPagoLiquidacion === 'Mixto' && (
                                    <div style={{ background: '#f1f5f9', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                                        <h5 style={{ margin: '0 0 0.75rem 0', color: '#475569', fontSize: '0.9rem' }}>Desglose de Pago</h5>
                                        <div style={{ display: 'flex', gap: '1rem' }}>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: '0.25rem' }}>Efectivo ($)</label>
                                                <input type="number" step="0.01" min="0" value={montoEfectivo} onChange={(e) => setMontoEfectivo(e.target.value !== '' ? Number(e.target.value) : '')} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: '0.25rem' }}>Tarjeta ($)</label>
                                                <input type="number" step="0.01" min="0" value={montoTarjeta} onChange={(e) => setMontoTarjeta(e.target.value !== '' ? Number(e.target.value) : '')} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.5rem' }}>
                                    <strong>TOTAL A PAGAR</strong>
                                    <strong style={{ color: '#16a34a' }}>${calcularTotalPagar().toFixed(2)}</strong>
                                </div>
                                {metodoPagoLiquidacion === 'Mixto' && (Number(montoEfectivo) || 0) + (Number(montoTarjeta) || 0) !== calcularTotalPagar() && (
                                    <div style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '0.5rem', textAlign: 'right' }}>
                                        La suma de los montos debe ser exactamente ${calcularTotalPagar().toFixed(2)}. Diferencia: ${Math.abs(calcularTotalPagar() - ((Number(montoEfectivo) || 0) + (Number(montoTarjeta) || 0))).toFixed(2)}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                
                {!isEditing && (
                    <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                        {showLiquidar && (
                            <button type="button" onClick={() => setShowLiquidar(false)} className="btn btn-ghost" disabled={isManaging}>Volver</button>
                        )}
                        <button type="button" onClick={() => setSelectedEvento(null)} className="btn btn-ghost" disabled={isManaging}>Cerrar</button>
                        {showLiquidar && (
                            <button type="button" onClick={handleLiquidarFinal} className="btn btn-primary" style={{ background: '#16a34a' }} disabled={isManaging || (metodoPagoLiquidacion === 'Mixto' && ((Number(montoEfectivo) || 0) + (Number(montoTarjeta) || 0) !== calcularTotalPagar()))}>
                                {isManaging ? 'Procesando...' : 'Confirmar Liquidación'}
                            </button>
                        )}
                    </div>
                )}
            </div>
          </div>
        )}

        {showCheckInModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
              <div style={{ background: '#fff', borderRadius: '1rem', width: '90%', maxWidth: '480px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                  <div style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: 'white', padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <FontAwesomeIcon icon={faCakeCandles} style={{ fontSize: '1.8rem' }} />
                      <div style={{ textAlign: 'left' }}>
                          <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'white', fontWeight: 800 }}>Ingreso a Evento</h3>
                          <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.9 }}>
                              {selectedEvento?.nombre_festejado ? `Cumpleaños de ${selectedEvento.nombre_festejado}` : 'Cumpleaños'} &bull; Fin: {selectedEvento ? (() => {
                                  const [year, month, day] = selectedEvento.fecha_evento.split('-');
                                  const [h, m] = selectedEvento.hora_inicio.split(':');
                                  const start = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(h), parseInt(m));
                                  const pkg = paquetesPrivados.find(p => p.id === selectedEvento.paquete_id);
                                  const dur = pkg?.duracion_minutos || 120;
                                  const end = new Date(start.getTime() + dur * 60000);
                                  return end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                              })() : 'Por definir'}
                          </p>
                      </div>
                  </div>
                  <div style={{ padding: '2rem 1.5rem' }}>
                      <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
                          <label style={{ fontSize: '0.9rem', fontWeight: 700, color: '#334155', marginBottom: '0.6rem', display: 'block' }}>Nombre Completo del Niño</label>
                          <input 
                              type="text" 
                              placeholder="Ej. Juanito Pérez" 
                              value={newGuestName}
                              onChange={(e) => setNewGuestName(toTitleCase(e.target.value))}
                              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                              autoFocus
                          />
                      </div>
                      <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
                          <label style={{ fontSize: '0.9rem', fontWeight: 700, color: '#334155', marginBottom: '0.6rem', display: 'block' }}>Paquete del Peke</label>
                          <select
                              value={newGuestPackageId}
                              onChange={(e) => setNewGuestPackageId(e.target.value)}
                              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.9rem' }}
                          >
                              <option value="">-- Paquete --</option>
                              {Object.entries(
                                  paquetesPrivados.reduce((acc, p) => {
                                      const isComida = p.nombre.toLowerCase().includes('comida');
                                      const groupName = isComida ? `${p.area} (Con Comida)` : p.area;
                                      if (!acc[groupName]) acc[groupName] = [];
                                      acc[groupName].push(p);
                                      return acc;
                                  }, {} as Record<string, typeof paquetesPrivados>)
                              ).map(([area, pkgs]) => (
                                  <optgroup key={area} label={area}>
                                      {pkgs.sort((a, b) => a.duracion_minutos - b.duracion_minutos).map(p => (
                                          <option key={p.id} value={p.id}>{p.nombre} (${p.precio})</option>
                                      ))}
                                  </optgroup>
                              ))}
                          </select>
                      </div>
                      <div style={{ marginTop: '2rem', fontSize: '0.75rem', color: '#6d28d9', background: '#f5f3ff', padding: '1rem', borderRadius: '12px', border: '1px solid #ddd6fe', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', textAlign: 'left' }}>
                          <span style={{ fontSize: '1rem' }}>🔔</span>
                          <span>
                              <strong>Nota de Sincronización:</strong> El tiempo de este peke terminará automáticamente a las {selectedEvento ? (() => {
                                  const [year, month, day] = selectedEvento.fecha_evento.split('-');
                                  const [h, m] = selectedEvento.hora_inicio.split(':');
                                  const start = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(h), parseInt(m));
                                  const pkg = paquetesPrivados.find(p => p.id === selectedEvento.paquete_id);
                                  const dur = pkg?.duracion_minutos || 120;
                                  const end = new Date(start.getTime() + dur * 60000);
                                  return end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                              })() : 'Por definir'} junto con todo el evento.
                          </span>
                      </div>
                  </div>
                  <div style={{ padding: '1.25rem 1.5rem', background: '#f8fafc', display: 'flex', gap: '1rem', borderTop: '1px solid #e2e8f0' }}>
                      <button 
                          className="btn btn-ghost" 
                          style={{ flex: 1, fontWeight: 700 }} 
                          onClick={() => setShowCheckInModal(false)}
                          disabled={isManaging}
                      >
                          Cancelar
                      </button>
                      <button 
                          className="btn btn-primary" 
                          style={{ 
                              flex: 1.5, 
                              background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', 
                              border: 'none', 
                              fontWeight: 800,
                              boxShadow: '0 4px 12px rgba(109, 40, 217, 0.3)'
                          }}
                          disabled={!newGuestName || isManaging || !newGuestPackageId}
                          onClick={handleAddGuest}
                      >
                          {isManaging ? 'Registrando...' : 'Confirmar Ingreso'}
                      </button>
                  </div>
              </div>
          </div>
        )}

        {editingGuest && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
              <div style={{ background: '#fff', borderRadius: '1rem', width: '90%', maxWidth: '440px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                  <div style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: 'white', padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <FontAwesomeIcon icon={faPen} style={{ fontSize: '1.5rem' }} />
                      <div style={{ textAlign: 'left' }}>
                          <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'white', fontWeight: 800 }}>Editar Invitado</h3>
                          <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.9 }}>Niño: {editingGuest.nombre_nino}</p>
                      </div>
                  </div>
                  <div style={{ padding: '2rem 1.5rem' }}>
                      <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
                          <label style={{ fontSize: '0.9rem', fontWeight: 700, color: '#334155', marginBottom: '0.6rem', display: 'block' }}>Nombre del Niño</label>
                          <input
                              type="text"
                              value={editGuestName}
                              onChange={(e) => setEditGuestName(toTitleCase(e.target.value))}
                              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                          />
                      </div>
                      <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
                          <label style={{ fontSize: '0.9rem', fontWeight: 700, color: '#334155', marginBottom: '0.6rem', display: 'block' }}>Selecciona el Nuevo Paquete</label>
                          <select
                              value={editGuestPackageId}
                              onChange={(e) => setEditGuestPackageId(e.target.value)}
                              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.9rem' }}
                          >
                              <option value="">-- Paquete --</option>
                              {Object.entries(
                                  paquetesPrivados.reduce((acc, p) => {
                                      const isComida = p.nombre.toLowerCase().includes('comida');
                                      const groupName = isComida ? `${p.area} (Con Comida)` : p.area;
                                      if (!acc[groupName]) acc[groupName] = [];
                                      acc[groupName].push(p);
                                      return acc;
                                  }, {} as Record<string, typeof paquetesPrivados>)
                              ).map(([area, pkgs]) => (
                                  <optgroup key={area} label={area}>
                                      {pkgs.sort((a, b) => a.duracion_minutos - b.duracion_minutos).map(p => (
                                          <option key={p.id} value={p.id}>{p.nombre} (${p.precio})</option>
                                      ))}
                                  </optgroup>
                              ))}
                          </select>
                      </div>
                  </div>
                  <div style={{ padding: '1.25rem 1.5rem', background: '#f8fafc', display: 'flex', gap: '1rem', borderTop: '1px solid #e2e8f0' }}>
                      <button 
                          className="btn btn-ghost" 
                          style={{ flex: 1, fontWeight: 700 }} 
                          onClick={() => setEditingGuest(null)}
                          disabled={isManaging}
                      >
                          Cancelar
                      </button>
                      <button 
                          className="btn btn-primary" 
                          style={{ 
                              flex: 1.5, 
                              background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', 
                              border: 'none', 
                              fontWeight: 800,
                              boxShadow: '0 4px 12px rgba(109, 40, 217, 0.3)'
                          }}
                          disabled={!editGuestPackageId || !editGuestName.trim() || isManaging}
                          onClick={async () => {
                              if (!editGuestPackageId || !editGuestName.trim()) return;
                              setIsManaging(true);
                              try {
                                  const selectedPkg = paquetesPrivados.find(p => p.id === editGuestPackageId);
                                  const cost = selectedPkg ? selectedPkg.precio : 0;
                                  await birthdayService.updateNino(editingGuest.id, editGuestName.trim(), editGuestPackageId, cost);
                                  showToast('Invitado actualizado con éxito.', 'success');
                                  setEditingGuest(null);
                                  if (selectedEvento) {
                                      const updated = await birthdayService.getDetallesEvento(selectedEvento.id);
                                      setNinosCumple(updated);
                                      setTotalNinos(updated.length);
                                  }
                              } catch (error) {
                                  console.error(error);
                                  showToast('Error al actualizar el invitado.', 'error');
                              } finally {
                                  setIsManaging(false);
                              }
                          }}
                      >
                          {isManaging ? 'Guardando...' : 'Guardar Cambios'}
                      </button>
                  </div>
              </div>
          </div>
        )}
     </div>
  );
};
