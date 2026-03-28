import React, { useState, useEffect, useMemo } from 'react';
import styles from './InventoryPOS.module.css';
import { stockService, type StockItem } from '../../lib/stockService';
import { registerInventorySale } from '../../lib/salesService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faSearch, 
    faShoppingCart, 
    faMoneyBillWave, 
    faCreditCard, 
    faTrash, 
    faPlus, 
    faMinus, 
    faSpinner, 
    faStore,
    faLock,
    faChevronUp,
    faChevronDown
} from '@fortawesome/free-solid-svg-icons';
import { useToast } from '../../components/Toast';
import { StatusModal } from '../../components/StatusModal';
import { PrinterService } from '../../lib/printerService';
import { getActiveSession, type CashSession, openCash } from '../../lib/treasuryService';

interface CartItem extends StockItem {
    quantity: number;
}

interface InventoryPOSProps {
    onCancel: () => void;
}

const formatMoney = (val: string) => {
    const clean = val.replace(/\D/g, '');
    if (!clean) return '';
    return new Intl.NumberFormat('es-MX').format(parseInt(clean));
};

const getNumericAmount = (val: string) => {
    return Number(val.replace(/,/g, '')) || 0;
};

export const InventoryPOS: React.FC<InventoryPOSProps> = ({ onCancel }) => {
    const { showToast } = useToast();
    const [inventory, setInventory] = useState<StockItem[]>([]);
    const [activeSession, setActiveSession] = useState<CashSession | null>(null);
    const [isCheckingSession, setIsCheckingSession] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [openingAmount, setOpeningAmount] = useState<string>('');
    const [cart, setCart] = useState<CartItem[]>(() => {
        const saved = localStorage.getItem('pos_cart');
        return saved ? JSON.parse(saved) : [];
    });
    const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'tarjeta'>(() => {
        return (localStorage.getItem('pos_payment_method') as 'efectivo' | 'tarjeta') || 'efectivo';
    });
    const [isLoading, setIsLoading] = useState(false);
    const [cashAmount, setCashAmount] = useState(() => {
        return localStorage.getItem('pos_cash_amount') || '';
    });
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [isCartExpanded, setIsCartExpanded] = useState(false);

    useEffect(() => {
        const init = async () => {
            setIsCheckingSession(true);
            try {
                const session = await getActiveSession();
                setActiveSession(session);
                if (session) {
                    await loadInventory();
                }
            } catch (err) {
                showToast('Error al verificar sesión de caja', 'error');
            } finally {
                setIsCheckingSession(false);
            }
        };
        init();
    }, []);

    const handleOpenCash = async () => {
        const monto = getNumericAmount(openingAmount);
        if (!openingAmount || isNaN(monto)) return showToast('Ingrese un monto válido', 'warning');
        
        setIsLoading(true);
        try {
            await openCash(monto);
            const session = await getActiveSession();
            setActiveSession(session);
            if (session) await loadInventory();
            showToast('Caja abierta con éxito. ¡Buenas ventas!', 'success');
        } catch (error) {
            showToast('Error al abrir la caja.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // Persistencia del Carrito
    useEffect(() => {
        localStorage.setItem('pos_cart', JSON.stringify(cart));
    }, [cart]);

    useEffect(() => {
        localStorage.setItem('pos_payment_method', paymentMethod);
    }, [paymentMethod]);

    useEffect(() => {
        localStorage.setItem('pos_cash_amount', cashAmount);
    }, [cashAmount]);

    const loadInventory = async () => {
        setIsLoading(true);
        try {
            const data = await stockService.getInventory();
            setInventory(data.filter(item => item.cantidad > 0));
        } catch (error) {
            showToast('Error al cargar el inventario', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const addToCart = (product: StockItem) => {
        const existing = cart.find(item => item.id === product.id);
        if (existing) {
            if (existing.quantity >= product.cantidad) {
                showToast('No hay suficiente stock disponible', 'warning');
                return;
            }
            setCart(cart.map(item => 
                item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
            ));
        } else {
            setCart([...cart, { ...product, quantity: 1 }]);
            // Auto-expandir en móvil si es el primer producto
            if (window.innerWidth <= 768) setIsCartExpanded(true);
        }
    };

    const removeFromCart = (productId: string) => {
        setCart(cart.filter(item => item.id !== productId));
    };

    const updateQuantity = (productId: string, delta: number) => {
        setCart(cart.map(item => {
            if (item.id === productId) {
                const newQty = item.quantity + delta;
                if (newQty <= 0) return item;
                if (newQty > (inventory.find(p => p.id === productId)?.cantidad || 0)) {
                    showToast('Stock insuficiente', 'warning');
                    return item;
                }
                return { ...item, quantity: newQty };
            }
            return item;
        }));
    };

    const total = cart.reduce((sum, item) => sum + (item.precio_venta * item.quantity), 0);
    const change = getNumericAmount(cashAmount) - total;

    const filteredProducts = useMemo(() => {
        return inventory.filter(p => 
            p.nombre.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [inventory, searchTerm]);

    const handlePayment = async () => {
        if (cart.length === 0) return;
        if (paymentMethod === 'efectivo' && getNumericAmount(cashAmount) < total) {
            showToast('Monto insuficiente', 'error');
            return;
        }

        setIsLoading(true);
        try {
            const result = await registerInventorySale({
                items: cart.map(item => ({
                    id: item.id,
                    name: item.nombre,
                    quantity: item.quantity,
                    price: item.precio_venta
                })),
                paymentMethod,
                total
            });

            if (result.success) {
                
                // Impresión de ticket
                try {
                    const ticketData = {
                        folio: result.transaction.id.substring(0, 8).toUpperCase(),
                        items: cart.map(item => ({
                            nombre: item.nombre,
                            precio: item.precio_venta,
                            cantidad: item.quantity,
                            importe: item.precio_venta * item.quantity
                        })),
                        total,
                        subtotal: total / 1.16,
                        iva: total - (total / 1.16),
                        paymentMethod: paymentMethod
                    };
                    const ticketStr = PrinterService.formatGenericPOSTicket(ticketData);
                    // Imprimimos dos tickets: Original y Copia
                    await PrinterService.printRaw(ticketStr, 'EPSON');
                    await PrinterService.printRaw(ticketStr, 'EPSON');
                } catch (e) {
                    console.error('Error al imprimir ticket:', e);
                }

                setShowSuccessModal(true);
                setCart([]);
                setCashAmount('');
                localStorage.removeItem('pos_cart');
                localStorage.removeItem('pos_cash_amount');
                localStorage.removeItem('pos_payment_method');
                loadInventory();
                showToast('Venta realizada con éxito', 'success');
            }
        } catch (error) {
            showToast('Error al procesar la venta', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    if (isCheckingSession) {
        return (
            <div className={styles.posContainer} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', height: '100%' }}>
                <div style={{ textAlign: 'center' }}>
                    <FontAwesomeIcon icon={faSpinner} spin size="4x" style={{ color: 'var(--brand-500)', marginBottom: '1.5rem' }} />
                    <h2 style={{ color: '#0f172a' }}>Sincronizando Bóveda...</h2>
                    <p style={{ color: '#64748b' }}>Verificando turno de caja y paquetes activos</p>
                </div>
            </div>
        );
    }

    if (!activeSession) {
        return (
            <div className={styles.posLockOverlay}>
                <div className={styles.premiumLockCard}>
                    <div className={styles.lockIconCircle}>
                        <FontAwesomeIcon icon={faLock} />
                    </div>
                    <h2>Caja Cerrada</h2>
                    <p>Para procesar ventas, primero debe iniciar un turno de caja.</p>
                    
                    <div className={styles.quickOpenForm}>
                        <label>FONDO INICIAL EN CAJA</label>
                        <div className={styles.openInputGroup}>
                            <span>$</span>
                            <input 
                                type="text" 
                                value={openingAmount} 
                                onChange={(e) => setOpeningAmount(formatMoney(e.target.value))}
                                onFocus={(e) => e.target.select()}
                                placeholder="0.00"
                            />
                        </div>
                        <button 
                            className={styles.openCashBtn} 
                            onClick={handleOpenCash}
                            disabled={isLoading}
                        >
                            {isLoading ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Abrir Turno Ahora'}
                        </button>
                        <button className={styles.secondaryNavBtn} onClick={onCancel}>
                            Volver al Dashboard
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.posContainer}>
            <div className={styles.productsSection}>
                <div className={styles.posHeader}>
                    <h2><FontAwesomeIcon icon={faStore} /> Tienda / POS</h2>
                    <div className={styles.searchBar}>
                        <FontAwesomeIcon icon={faSearch} className={styles.searchIcon} />
                        <input 
                            type="text" 
                            placeholder="Buscar producto..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className={styles.productGrid}>
                    {filteredProducts.map(product => (
                        <div 
                            key={product.id} 
                            className={styles.productCard}
                            onClick={() => addToCart(product)}
                        >
                            <div className={styles.productInfo}>
                                <h4>{product.nombre}</h4>
                                <span className={styles.productStock}>{product.cantidad} en stock</span>
                            </div>
                            <div className={styles.priceTag}>
                                <span className={styles.productPrice}>${product.precio_venta}.00</span>
                            </div>
                        </div>
                    ))}
                    {filteredProducts.length === 0 && !isLoading && (
                        <div className={styles.emptyCart}>No se encontraron productos</div>
                    )}
                </div>
            </div>

            <div className={`${styles.cartSection} ${isCartExpanded ? styles.expanded : ''}`}>
                <div className={styles.cartHeader} onClick={() => setIsCartExpanded(!isCartExpanded)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FontAwesomeIcon icon={faShoppingCart} />
                        <h3>Carrito {cart.length > 0 && `(${cart.length})`}</h3>
                    </div>
                    <div className={styles.mobileSummary}>
                        <span className={styles.mobileTotal}>Total: ${total.toFixed(0)}</span>
                        <FontAwesomeIcon icon={isCartExpanded ? faChevronDown : faChevronUp} className={styles.toggleIcon} />
                    </div>
                </div>

                <div className={styles.cartItems}>
                    {cart.map(item => (
                        <div key={item.id} className={styles.cartItem}>
                            <div className={styles.itemInfo}>
                                <strong>{item.nombre}</strong>
                                <small>${item.precio_venta}.00</small>
                            </div>
                            <div className={styles.qtyActions}>
                                <button className={styles.qtyBtn} onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, -1); }}>
                                    <FontAwesomeIcon icon={faMinus} />
                                </button>
                                <span>{item.quantity}</span>
                                <button className={styles.qtyBtn} onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, 1); }}>
                                    <FontAwesomeIcon icon={faPlus} />
                                </button>
                                <button className={styles.qtyBtn} style={{ color: '#ef4444', marginLeft: '0.5rem' }} onClick={(e) => { e.stopPropagation(); removeFromCart(item.id); }}>
                                    <FontAwesomeIcon icon={faTrash} />
                                </button>
                            </div>
                        </div>
                    ))}
                    {cart.length === 0 && (
                        <div className={styles.emptyCart}>
                            <FontAwesomeIcon icon={faShoppingCart} size="3x" />
                            <p>El carrito está vacío</p>
                        </div>
                    )}
                </div>

                <div className={styles.cartFooter}>
                    <div className={styles.summaryTotal}>
                        <span>TOTAL</span>
                        <span>${total.toFixed(2)}</span>
                    </div>

                    <div className={styles.paymentMethods}>
                        <button 
                            className={`${styles.methodBtn} ${paymentMethod === 'efectivo' ? styles.active : ''}`}
                            onClick={() => setPaymentMethod('efectivo')}
                        >
                            <FontAwesomeIcon icon={faMoneyBillWave} />
                            <span>EFECTIVO</span>
                        </button>
                        <button 
                            className={`${styles.methodBtn} ${paymentMethod === 'tarjeta' ? styles.active : ''}`}
                            onClick={() => setPaymentMethod('tarjeta')}
                        >
                            <FontAwesomeIcon icon={faCreditCard} />
                            <span>TARJETA</span>
                        </button>
                    </div>

                    {paymentMethod === 'efectivo' && total > 0 && (
                        <div className={styles.cashInputWrapper}>
                            <div className={styles.cashInput}>
                                <span>$</span>
                                <input 
                                    type="text"
                                    value={cashAmount}
                                    onChange={(e) => setCashAmount(formatMoney(e.target.value))}
                                    onFocus={(e) => e.target.select()}
                                    placeholder="0.00"
                                />
                            </div>
                            {getNumericAmount(cashAmount) >= total && (
                                <div className={styles.changeInfo}>
                                    Cambio a entregar: ${change.toFixed(2)}
                                </div>
                            )}
                        </div>
                    )}

                    <button 
                        className={styles.payBtn}
                        disabled={cart.length === 0 || isLoading || (paymentMethod === 'efectivo' && getNumericAmount(cashAmount) < total)}
                        onClick={handlePayment}
                    >
                        {isLoading ? <FontAwesomeIcon icon={faSpinner} spin /> : 'CONFIRMAR VENTA'}
                    </button>
                </div>
            </div>

            <StatusModal 
                isOpen={showSuccessModal}
                status="success"
                title="Venta Finalizada"
                message="La venta se ha registrado y el ticket ha sido enviado a la impresora."
                onAction={() => setShowSuccessModal(false)}
                actionLabel="Entendido"
            />
        </div>
    );
};
