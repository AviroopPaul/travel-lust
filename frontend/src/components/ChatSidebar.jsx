import React, { useState, useEffect } from 'react';
import { getSessions, getSession, deleteSession } from '../api';

const ChatSidebar = ({ isOpen, onClose, onSelectSession, currentSessionId }) => {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState(null);

    useEffect(() => {
        if (isOpen) {
            fetchSessions();
        }
    }, [isOpen]);

    const fetchSessions = async () => {
        setLoading(true);
        try {
            const data = await getSessions();
            setSessions(data || []);
        } catch (error) {
            console.error('Failed to fetch sessions:', error);
            setSessions([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectSession = async (sessionId) => {
        try {
            const sessionData = await getSession(sessionId);
            onSelectSession(sessionData);
            onClose();
        } catch (error) {
            console.error('Failed to load session:', error);
        }
    };

    const handleDeleteSession = async (e, sessionId) => {
        e.stopPropagation();
        setDeletingId(sessionId);
        try {
            await deleteSession(sessionId);
            setSessions(prev => prev.filter(s => s.id !== sessionId));
        } catch (error) {
            console.error('Failed to delete session:', error);
        } finally {
            setDeletingId(null);
        }
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        
        if (days === 0) {
            const hours = Math.floor(diff / (1000 * 60 * 60));
            if (hours === 0) {
                const minutes = Math.floor(diff / (1000 * 60));
                return minutes <= 1 ? 'Just now' : `${minutes}m ago`;
            }
            return `${hours}h ago`;
        } else if (days === 1) {
            return 'Yesterday';
        } else if (days < 7) {
            return `${days} days ago`;
        } else {
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div 
                className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${
                    isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                onClick={onClose}
            />
            
            {/* Sidebar */}
            <div 
                className={`fixed left-0 top-0 h-full w-full max-w-sm bg-[var(--color-bg)] border-r border-[var(--color-border)] z-50 transform transition-transform duration-300 ease-out ${
                    isOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
            >
                {/* Header */}
                <div className="sticky top-0 bg-[var(--color-bg)]/95 backdrop-blur-md border-b border-[var(--color-border)] px-6 py-4 flex items-center justify-between">
                    <div>
                        <h2 className="font-serif text-2xl text-[var(--color-text)]">Your Trips</h2>
                        <p className="text-[var(--color-text-muted)] text-sm mt-1">Past trip plans</p>
                    </div>
                    <button 
                        onClick={onClose}
                        className="w-10 h-10 rounded-xl bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)] flex items-center justify-center transition-colors"
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 4L4 12M4 4l8 8" />
                        </svg>
                    </button>
                </div>
                
                {/* Content */}
                <div className="overflow-y-auto h-[calc(100%-80px)] px-4 py-4">
                    {loading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="glass rounded-xl p-4 animate-pulse">
                                    <div className="h-5 bg-[var(--color-surface-2)] rounded w-3/4 mb-2" />
                                    <div className="h-4 bg-[var(--color-surface-2)] rounded w-1/2" />
                                </div>
                            ))}
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className="text-center py-16">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--color-surface)] flex items-center justify-center">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-subtle)" strokeWidth="1.5">
                                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                                    <circle cx="12" cy="7" r="4"/>
                                </svg>
                            </div>
                            <p className="text-[var(--color-text-muted)] mb-1">No trips yet</p>
                            <p className="text-[var(--color-text-subtle)] text-sm">Start planning your first adventure</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {sessions.map((session) => (
                                <div
                                    key={session.id}
                                    onClick={() => handleSelectSession(session.id)}
                                    className={`group relative glass rounded-xl p-4 cursor-pointer transition-all duration-200 hover:bg-[var(--color-surface-2)] ${
                                        currentSessionId === session.id 
                                            ? 'border-[var(--color-accent)]/50 bg-[var(--color-accent)]/5' 
                                            : ''
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-lg">
                                                    {session.destination ? '✈️' : '📋'}
                                                </span>
                                                <h3 className="font-medium text-[var(--color-text)] truncate">
                                                    {session.title || session.destination || 'Untitled Trip'}
                                                </h3>
                                            </div>
                                            {session.destination && session.title !== session.destination && (
                                                <p className="text-[var(--color-text-muted)] text-sm truncate mb-1">
                                                    {session.destination}
                                                </p>
                                            )}
                                            <div className="flex items-center gap-2 text-xs text-[var(--color-text-subtle)]">
                                                <span>{formatDate(session.updated_at || session.created_at)}</span>
                                                {currentSessionId === session.id && (
                                                    <>
                                                        <span className="text-[var(--color-border)]">•</span>
                                                        <span className="text-[var(--color-accent)]">Active</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        
                                        {/* Delete button */}
                                        <button
                                            onClick={(e) => handleDeleteSession(e, session.id)}
                                            disabled={deletingId === session.id}
                                            className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition-all"
                                        >
                                            {deletingId === session.id ? (
                                                <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                                                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default ChatSidebar;

