import axios from 'axios';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
// Import the WebSocket context hook
import { useWebSocket } from '../context/WebSocketContext';

// Theme Toggle Component
const ThemeToggle = () => {
  // Existing code remains the same
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const contentWrapper = document.querySelector('.content-wrapper');
    
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
      if (contentWrapper) contentWrapper.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
      if (contentWrapper) contentWrapper.classList.remove('dark-mode');
    }
  }, [isDarkMode]);

  const toggleTheme = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('theme', newMode ? 'dark' : 'light');
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
    }
  }, []);

  return (
    <button 
      className="theme-toggle-button" 
      onClick={toggleTheme}
    >
      {isDarkMode ? 'Light Mode' : 'Dark Mode'}
    </button>
  );
};

// Currency Formatting Utility
const formatCurrency = (value) => {
  if (value === null || value === undefined) return 'N/A';
  
  const num = parseFloat(value);
  if (isNaN(num)) return 'N/A';
  
  // Handle large numbers
  if (num >= 1000000000) {
    return `$${(num / 1000000000).toFixed(2)}B`;
  } else if (num >= 1000000) {
    return `$${(num / 1000000).toFixed(2)}M`;
  } else if (num >= 1000) {
    return `$${(num / 1000).toFixed(2)}K`;
  }
  
  // Format based on value size
  if (num >= 1) {
    return `$${num.toFixed(2)}`;
  } else if (num >= 0.01) {
    return `$${num.toFixed(4)}`;
  } else {
    return `$${num.toFixed(8)}`;
  }
};

// Token Card Component - Updated with state navigation
function TokenCard({ token, highlight = false }) {
  const navigate = useNavigate();
  const dexScreenerLink = `https://dexscreener.com/base/${token.contractAddress}`;

  const handleCardClick = (e) => {
    // Prevent navigation if DexScreener link is clicked
    if (e.target.closest('.dexscreener-link')) return;
    
    // Navigate with state information to indicate this came from the dashboard
    navigate(`/token/${token.contractAddress}`, {
      state: { 
        fromDashboard: true,
        // Optionally pass minimal token data to show immediately
        tokenPreview: {
          name: token.name,
          symbol: token.symbol,
          price_usd: token.price_usd,
          fdv_usd: token.fdv_usd,
          volume_usd: token.volume_usd,
          contractAddress: token.contractAddress
        }
      }
    });
  };

  return (
    <div 
      className={`token-card ${highlight ? 'highlight-card' : ''}`}
      onClick={handleCardClick}
      style={{ cursor: 'pointer' }}
    >
      <div className="token-card-header">
        <h3>{token.name}</h3>
        <a 
          href={dexScreenerLink} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="dexscreener-link"
          onClick={(e) => e.stopPropagation()}
        >
          DexScreener
        </a>
      </div>
      <p>Symbol: {token.symbol}</p>
      <p>Price: {formatCurrency(token.price_usd)}</p>
      <p>Market Cap: {formatCurrency(token.fdv_usd)}</p>
      <p>24h Volume: {formatCurrency(token.volume_usd)}</p>
      <small>CA: {token.contractAddress}</small>
    </div>
  );
}

// Main Token Dashboard Component
function TokenDashboard() {
  // Get the WebSocket context instead of creating a new connection
  const { isConnected, emit, addListener, removeListener } = useWebSocket();
  
  const [tokens, setTokens] = useState([]);
  const [highestMarketCapToken, setHighestMarketCapToken] = useState(null);
  const [highestVolumeToken, setHighestVolumeToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortField, setSortField] = useState('marketCap');
  const [sortDirection, setSortDirection] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  
  // Enhanced screen dimensions tracking with height classes
  const [screenDimensions, setScreenDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });
  
  // More granular height breakpoints for 14-inch screens
  const isMobile = screenDimensions.width <= 768;
  const isShortScreen = screenDimensions.height <= 800;
  const isVeryShortScreen = screenDimensions.height <= 700; // Targeting 14-inch screens
  const isExtremelyShortScreen = screenDimensions.height <= 600;
  
  // Banner text for scrolling banner
  const bannerText = "WELCOME TO THE JUNGLE • WELCOME TO THE JUNGLE • WELCOME TO THE JUNGLE • ";

  // Check screen dimensions on resize
  useEffect(() => {
    const handleResize = () => {
      setScreenDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Apply more specific height-based classes
  useEffect(() => {
    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
      // Reset all height classes
      appContainer.classList.remove('short-screen', 'very-short-screen', 'extremely-short-screen');
      
      // Apply appropriate class based on current height
      if (isExtremelyShortScreen) {
        appContainer.classList.add('extremely-short-screen');
      } else if (isVeryShortScreen) {
        appContainer.classList.add('very-short-screen');
      } else if (isShortScreen) {
        appContainer.classList.add('short-screen');
      }
    }
  }, [isShortScreen, isVeryShortScreen, isExtremelyShortScreen]);

  // Setup event listeners for WebSocket
  useEffect(() => {
    if (isConnected) {
      console.log("[TokenDashboard] WebSocket is connected, setting up event listeners");
      setLoading(true);
      
      // Register token list update listener
      const tokensListUpdateHandler = (data) => {
        setTokens(data.tokens);
        setTotalPages(data.totalPages);
        setLoading(false);
      };
      
      // Register top tokens update listener
      const topTokensUpdateHandler = (data) => {
        setHighestMarketCapToken(data.topMarketCapToken);
        setHighestVolumeToken(data.topVolumeToken);
      };
      
      // Register individual token update listener
      const tokenUpdateHandler = (updatedToken) => {
        // Update the token in our existing list if it's there
        setTokens(currentTokens => 
          currentTokens.map(token => 
            token.contractAddress === updatedToken.contractAddress 
              ? { ...token, ...updatedToken } 
              : token
          )
        );
        
        // Check if we need to update highlighted tokens
        if (highestMarketCapToken && 
            highestMarketCapToken.contractAddress === updatedToken.contractAddress) {
          setHighestMarketCapToken({ ...highestMarketCapToken, ...updatedToken });
        }
        
        if (highestVolumeToken && 
            highestVolumeToken.contractAddress === updatedToken.contractAddress) {
          setHighestVolumeToken({ ...highestVolumeToken, ...updatedToken });
        }
      };
      
      // Register error handler
      const errorHandler = (errorData) => {
        console.error('[TokenDashboard] Socket error:', errorData);
        setError(`Error: ${errorData.message || 'Unknown error'}`);
      };
      
      // Add all event listeners
      addListener('tokens-list-update', tokensListUpdateHandler);
      addListener('top-tokens-update', topTokensUpdateHandler);
      addListener('token-update', tokenUpdateHandler);
      addListener('error', errorHandler);
      
      // Request initial data
      emit('get-tokens', {
        sort: sortField,
        direction: sortDirection,
        page: currentPage
      });
      
      // Clean up function to remove all event listeners
      return () => {
        console.log("[TokenDashboard] Cleaning up event listeners");
        removeListener('tokens-list-update', tokensListUpdateHandler);
        removeListener('top-tokens-update', topTokensUpdateHandler);
        removeListener('token-update', tokenUpdateHandler);
        removeListener('error', errorHandler);
      };
    } else {
      console.log("[TokenDashboard] WebSocket not yet connected");
      
      // Fall back to HTTP if WebSocket isn't connected
      fallbackToHttpPolling();
    }
  }, [isConnected]); // Only re-run when connection status changes
  
  // Request updated data when sort or page changes via WebSocket
  useEffect(() => {
    if (isConnected) {
      setLoading(true);
      
      console.log(`[TokenDashboard] Sort/page changed - Sending params: field=${sortField}, direction=${sortDirection}, page=${currentPage}`);
      
      emit('get-tokens', {
        sort: sortField,
        direction: sortDirection,
        page: currentPage
      });
    } else {
      // If WebSocket is not connected, fall back to HTTP
      fallbackToHttpPolling();
    }
  }, [sortField, sortDirection, currentPage, isConnected, emit]);

  // Fallback to HTTP polling if WebSocket fails
  const fallbackToHttpPolling = useCallback(() => {
    console.log('[TokenDashboard] Falling back to HTTP polling');
    
    // Only proceed with HTTP polling if socket is not connected
    if (!isConnected) {
      fetchGlobalTopTokens();
      fetchTokens(sortField, sortDirection, currentPage);
    }
  }, [sortField, sortDirection, currentPage, isConnected]);
  
  // Original HTTP methods kept as fallbacks
  const fetchGlobalTopTokens = useCallback(async () => {
    try {
      const response = await axios.get('https://website-4g84.onrender.com/api/global-top-tokens');
      
      setHighestMarketCapToken(response.data.topMarketCapToken);
      setHighestVolumeToken(response.data.topVolumeToken);
    } catch (err) {
      console.error('Failed to fetch global top tokens', err);
    }
  }, []);

  const fetchTokens = useCallback(async (field, direction, page) => {
    try {
      setLoading(true);
      const response = await axios.get('https://website-4g84.onrender.com/api/tokens', {
        params: {
          sort: field === 'marketCap' ? 'marketCap' : 'volume',
          direction: direction,
          page: page
        }
      });
      
      setTokens(response.data.tokens);
      setTotalPages(response.data.totalPages);
    } catch (err) {
      setError('Failed to fetch tokens');
    } finally {
      setTimeout(() => setLoading(false), 300);
    }
  }, []);

  const handleSort = (field) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  const handlePageChange = (newPage) => {
    if (newPage > 0 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  // Adjust monkey count based on screen dimensions
  const getMonkeyCount = () => {
    // First consider height constraints
    if (isExtremelyShortScreen) return 0; // No monkeys on very small screens
    if (isVeryShortScreen) return 2; // Fewer monkeys on 14-inch screens
    
    // Then consider width constraints
    if (screenDimensions.width <= 576) return 3;
    if (screenDimensions.width <= 768) return 4;
    if (screenDimensions.width <= 992) return 5;
    return 8; // Default for larger screens
  };

  const monkeyCount = getMonkeyCount();

  // Get height-responsive styles for monkey images
  const getMonkeyHeight = () => {
    if (isVeryShortScreen) return '120px';
    if (isShortScreen) return '160px';
    return '213px'; // Default height
  };

  return (
    <div className={`app-container ${isShortScreen ? 'short-screen' : ''} ${isVeryShortScreen ? 'very-short-screen' : ''} ${isExtremelyShortScreen ? 'extremely-short-screen' : ''}`}>
      {/* Theme Toggle Component */}
      <ThemeToggle />

      <div className="static-top-section">
        {/* Logo positioned absolutely over the background */}
        <div className="logo-container">
          <img src="https://i.postimg.cc/mDgvXZqN/LOGO.png" alt="Logo" />
        </div>

        <div className="token-dashboard">
          {/* Connection status indicator */}
          <div className="connection-status" style={{ 
            position: 'absolute', 
            top: '10px', 
            right: '10px',
            display: 'flex',
            alignItems: 'center',
            fontSize: '12px',
            padding: '4px 8px',
            background: 'rgba(0,0,0,0.7)',
            borderRadius: '4px',
            color: isConnected ? '#00ff88' : '#ff4466'
          }}>
            <span style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              background: isConnected ? '#00ff88' : '#ff4466',
              display: 'inline-block',
              marginRight: '5px'
            }}></span>
            {isConnected ? 'Live' : 'Offline'}
          </div>

          {/* Sorting Controls */}
          <div className="sorting-controls">
            <button 
              onClick={() => handleSort('marketCap')}
              className={sortField === 'marketCap' ? 'active' : ''}
            >
              Sort by Market Cap {sortField === 'marketCap' && (sortDirection === 'desc' ? '▼' : '▲')}
            </button>
            <button 
              onClick={() => handleSort('volume')}
              className={sortField === 'volume' ? 'active' : ''}
            >
              Sort by Volume {sortField === 'volume' && (sortDirection === 'desc' ? '▼' : '▲')}
            </button>
          </div>

          {/* Top Tokens Section with updated titles */}
          {highestMarketCapToken && highestVolumeToken && (
            <div className="top-tokens-section">
              <div className="top-tokens-titles">
                <h2 className="top-token-title">KING OF THE MOUNTAIN</h2>
                <h2 className="top-token-title">KING OF THE JUNGLE</h2>
              </div>
              <div className="top-tokens-grid">
                <TokenCard token={highestMarketCapToken} highlight={true} />
                <TokenCard token={highestVolumeToken} highlight={true} />
              </div>
            </div>
          )}
        </div>

        {/* Conditionally render monkey divider based on screen height */}
        {monkeyCount > 0 && (
          <div className="monkey-divider">
            {/* First set of monkeys (left side) */}
            {[...Array(Math.floor(monkeyCount / 2))].map((_, index) => (
              <img 
                key={`left-${index}`} 
                src="https://i.postimg.cc/442Y1Byj/7.png" 
                alt="Monkey divider" 
                style={{ height: getMonkeyHeight() }}
              />
            ))}
            
            {/* Empty space for the center */}
            {!isMobile && !isVeryShortScreen && (
              [...Array(isShortScreen ? 2 : 4)].map((_, index) => (
                <div key={`empty-${index}`} style={{ width: isShortScreen ? '100px' : '213px' }}></div>
              ))
            )}
            
            {/* Second set of monkeys (right side) */}
            {[...Array(Math.floor(monkeyCount / 2))].map((_, index) => (
              <img 
                key={`right-${index}`} 
                src="https://i.postimg.cc/442Y1Byj/7.png"
                alt="Monkey divider" 
                style={{ height: getMonkeyHeight() }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="content-wrapper">
        {/* Scrolling banner directly integrated at the top */}
        <div className="scrolling-banner-container">
          <div className="scrolling-banner">
            <div className="scrolling-banner-content">
              {bannerText.repeat(5)}
            </div>
          </div>
        </div>

        {loading && tokens.length > 0 ? (
          <div className="loading-overlay">
            <div className="loading-spinner"></div>
          </div>
        ) : null}

        {loading && tokens.length === 0 ? (
          <div className="loading-message">Loading tokens...</div>
        ) : error ? (
          <div className="error-message">{error}</div>
        ) : (
          <>
            <div className="token-grid">
              {tokens.map((token) => (
                <TokenCard key={token.contractAddress} token={token} />
              ))}
            </div>

            {/* Mobile spacer - will only show on mobile */}
            <div className="mobile-spacer"></div>
            
            {/* Extra spacing div with inline style for mobile */}
            {isMobile && (
              <div style={{ height: '80px', width: '100%' }}></div>
            )}

            {/* Pagination Controls */}
            <div 
              className="pagination-controls"
              style={{ 
                marginTop: isMobile ? '80px' : '20px'
              }}
            >
              <button 
                onClick={() => handlePageChange(1)} 
                disabled={currentPage === 1}
              >
                First
              </button>
              <button 
                onClick={() => handlePageChange(currentPage - 1)} 
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <span className="page-info">
                Page {currentPage} of {totalPages}
              </span>
              <button 
                onClick={() => handlePageChange(currentPage + 1)} 
                disabled={currentPage === totalPages}
              >
                Next
              </button>
              <button 
                onClick={() => handlePageChange(totalPages)} 
                disabled={currentPage === totalPages}
              >
                Last
              </button>
            </div>

            {/* Logo above social button */}
            <div className="logo-above-socials">
            <img src="https://i.postimg.cc/mDgvXZqN/LOGO.png" alt="Logo" />
            </div>
            
            {/* Social Button - added below pagination controls */}
            <div className="social-button-container">
              <a 
                href="https://linktr.ee/kingofapesbase" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="social-button"
              >
                SOCIALS
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default TokenDashboard;