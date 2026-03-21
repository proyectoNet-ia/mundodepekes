import React, { useState } from 'react';
import { authService } from '../../lib/authService';
import styles from './Login.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelope, faLock, faRocket, faTriangleExclamation, faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';

interface LoginProps {
    onLoginSuccess: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        
        try {
            await authService.signIn(email, password);
            onLoginSuccess();
        } catch (err: any) {
            setError(err.message || 'Error de autenticación. Verifique sus credenciales.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={styles.loginPage}>
            <div className={styles.blob + ' ' + styles.blob1}></div>
            <div className={styles.blob + ' ' + styles.blob2}></div>
            
            <div className={styles.loginCard}>
                <div className={styles.header}>
                    <div className={styles.logoCircle}>
                        <FontAwesomeIcon icon={faRocket} />
                    </div>
                    <h1>Mundo de Pekes</h1>
                    <p>Admin OS — Acceso Seguro</p>
                </div>

                <form className={styles.form} onSubmit={handleLogin}>
                    <div className={styles.inputGroup}>
                        <label>Correo Electrónico</label>
                        <div className={styles.inputWrapper}>
                            <FontAwesomeIcon icon={faEnvelope} className={styles.inputIcon} />
                            <input 
                                type="email" 
                                placeholder="usuario@pekes.com" 
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className={styles.inputGroup}>
                        <label>Contraseña</label>
                        <div className={styles.inputWrapper}>
                            <FontAwesomeIcon icon={faLock} className={styles.inputIcon} />
                            <input 
                                type={showPassword ? 'text' : 'password'} 
                                placeholder="••••••••" 
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                            />
                            <button 
                                type="button" 
                                className={styles.togglePass}
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className={styles.errorAlert}>
                            <FontAwesomeIcon icon={faTriangleExclamation} />
                            <span>{error}</span>
                        </div>
                    )}

                    <button 
                        type="submit" 
                        className={styles.loginBtn}
                        disabled={isLoading}
                    >
                        {isLoading ? 'Autenticando...' : 'Iniciar Sesión'}
                    </button>
                </form>

                <footer className={styles.footer}>
                    &copy; 2026 PekePark Technologies
                </footer>
            </div>
        </div>
    );
};
