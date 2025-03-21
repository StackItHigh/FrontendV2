import axios from 'axios';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWebSocket } from '../context/WebSocketContext';

// Apply black background immediately to prevent white flash
// This runs before the component is even mounted
document.body.style.background = 'none';
document.body.style.backgroundColor = '#000000';

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

function TokenDetailPage() {
  const { contractAddress } = useParams();
  const navigate = useNavigate();
  const [tokenDetails, setTokenDetails] = useState(null);
  const [poolAddress, setPoolAddress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLoadingChart, setIsLoadingChart] = useState(true);
  const [dataSource, setDataSource] = useState(null); // 'websocket' or 'http'
  
  // Use the shared WebSocket context
  const { isConnected, emit, addListener, removeListener } = useWebSocket();
  
  // Track if component is mounted
  const isMounted = useRef(true);
  const dataRequested = useRef(false);
  const httpFallbackTimer = useRef(null);
  
  // Add this effect to store current token in localStorage
  useEffect(() => {
    if (tokenDetails && tokenDetails.contractAddress) {
      localStorage.setItem('currentTokenAddress', tokenDetails.contractAddress);
    }
  }, [tokenDetails]);
  
  // Add this effect to recover from localStorage if needed
  useEffect(() => {
    if (!contractAddress && localStorage.getItem('currentTokenAddress')) {
      navigate(`/token/${localStorage.getItem('currentTokenAddress')}`);
    }
  }, [contractAddress, navigate]);
  
  // Save original background styles for cleanup
  const originalStyles = useRef({
    background: '',
    backgroundColor: '',
    overflow: ''
  });
  
  // Add this effect to manage the background and body styles
  useEffect(() => {
    // Save the original styles first
    originalStyles.current = {
      background: document.body.style.background,
      backgroundColor: document.body.style.backgroundColor,
      overflow: document.body.style.overflow
    };
    
    // Apply black background to body and prevent scrolling issues
    document.body.style.background = 'none';
    document.body.style.backgroundColor = '#000000';
    document.body.style.overflow = 'auto';
    
    // Add a class for CSS targeting
    document.body.classList.add('on-token-detail-page');
    
    // Cleanup when component unmounts
    return () => {
      // Only restore original background if we're navigating away (not refreshing)
      if (isMounted.current) {
        document.body.style.background = originalStyles.current.background;
        document.body.style.backgroundColor = originalStyles.current.backgroundColor;
        document.body.style.overflow = originalStyles.current.overflow;
        document.body.classList.remove('on-token-detail-page');
      }
    };
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
      clearTimeout(httpFallbackTimer.current);
    };
  }, []);

  // HTTP fallback function
  const fallbackToHttp = async () => {
    // Only proceed if we're still loading and don't have data yet
    if (!isMounted.current || !loading || tokenDetails) return;
    
    console.log('Falling back to HTTP request');
    try {
      setDataSource('http');
      const response = await axios.get(`https://website-4g84.onrender.com/api/tokens/${contractAddress}`);
      
      if (!isMounted.current) return;
      
      if (response && response.data) {
        setTokenDetails(response.data);
        
        if (response.data.main_pool_address) {
          setPoolAddress(response.data.main_pool_address);
        } else {
          setPoolAddress(contractAddress);
        }
        
        setLoading(false);
      } else {
        throw new Error('No data received from API');
      }
    } catch (err) {
      if (!isMounted.current) return;
      
      console.error('HTTP fallback error:', err);
      setError('Failed to fetch token details');
      setLoading(false);
    }
  };

  // Main effect for loading token data
  useEffect(() => {
    console.log(`Loading token details for contract: ${contractAddress}`);
    
    // Reset states when contract address changes
    setTokenDetails(null);
    setPoolAddress(null);
    setLoading(true);
    setError(null);
    dataRequested.current = false;
    
    // If no contract address, exit early
    if (!contractAddress) {
      setError('Invalid token address');
      setLoading(false);
      return;
    }
    
    // Handler functions
    const handleTokenDetails = (data) => {
      if (!isMounted.current) return;
      
      console.log('Received token details:', data);
      setTokenDetails(data);
      setDataSource('websocket');
      
      if (data.main_pool_address) {
        setPoolAddress(data.main_pool_address);
      } else {
        setPoolAddress(contractAddress);
      }
      
      setLoading(false);
    };
    
    const handleTokenUpdate = (data) => {
      if (!isMounted.current) return;
      
      if (data.contractAddress === contractAddress) {
        console.log('Received real-time token update:', data);
        setTokenDetails(prevDetails => ({
          ...prevDetails,
          ...data
        }));
      }
    };
    
    const handleError = (err) => {
      if (!isMounted.current) return;
      
      console.error('Socket error:', err);
      // Don't set error state here, as we'll try HTTP fallback
      
      // Trigger HTTP fallback immediately on socket error
      fallbackToHttp();
    };
    
    // Add listeners
    addListener('token-details', handleTokenDetails);
    addListener('token-details-update', handleTokenUpdate);
    addListener('error', handleError);
    
    // Request token details if connected
    if (isConnected && !dataRequested.current) {
      console.log(`WebSocket connected, requesting token details for ${contractAddress}`);
      dataRequested.current = true;
      emit('get-token-details', { contractAddress });
    } else {
      // Start HTTP fallback timer - shortened to improve user experience
      console.log('WebSocket not connected, setting HTTP fallback timer');
      httpFallbackTimer.current = setTimeout(() => {
        if (isMounted.current && loading && !tokenDetails) {
          console.log('WebSocket request timeout - falling back to HTTP');
          fallbackToHttp();
        }
      }, 3000); // Reduced from 5000ms to 3000ms
    }
    
    // Clean up
    return () => {
      clearTimeout(httpFallbackTimer.current);
      removeListener('token-details', handleTokenDetails);
      removeListener('token-details-update', handleTokenUpdate);
      removeListener('error', handleError);
    };
  }, [contractAddress, isConnected, emit, addListener, removeListener]);
  
  // Effect to request data when connection state changes
  useEffect(() => {
    if (isConnected && contractAddress && !tokenDetails && !dataRequested.current) {
      console.log(`WebSocket connection established, requesting token details for ${contractAddress}`);
      dataRequested.current = true;
      emit('get-token-details', { contractAddress });
    }
  }, [isConnected, contractAddress, tokenDetails, emit]);

  // Handler for chart loading
  const handleChartLoad = () => {
    console.log('Chart iframe loaded');
    setIsLoadingChart(false);
  };

  // Copy address to clipboard function
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        alert('Copied to clipboard');
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
      });
  };

  // Improved loading state with better UX
  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#000000',
        color: '#ffb300',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 999
      }}>
        <div style={{ fontSize: '20px', marginBottom: '15px' }}>Loading Token Data</div>
        {contractAddress && (
          <div style={{ fontSize: '14px', marginBottom: '20px', opacity: 0.8 }}>
            Contract: {contractAddress.slice(0, 6)}...{contractAddress.slice(-4)}
          </div>
        )}
        <div className="loading-spinner" style={{ width: '40px', height: '40px', borderTopColor: '#ffb300' }}></div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#000000',
        color: '#ffb300',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 999
      }}>
        <div style={{ fontSize: '20px', marginBottom: '15px', color: '#ff4466' }}>Error Loading Token</div>
        <div style={{ fontSize: '16px', marginBottom: '20px', maxWidth: '80%', textAlign: 'center' }}>{error}</div>
        <button 
          onClick={() => window.history.back()} 
          style={{ 
            padding: '10px 20px', 
            background: '#ffb300', 
            color: '#000000', 
            border: 'none', 
            borderRadius: '6px', 
            cursor: 'pointer',
            marginTop: '20px',
            fontSize: '16px',
            fontFamily: "'Chewy', cursive"
          }}
        >
          ← Go Back
        </button>
      </div>
    );
  }
  
  if (!tokenDetails) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#000000',
        color: '#ffb300',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 999
      }}>
        <div style={{ fontSize: '20px', marginBottom: '15px', color: '#ff9900' }}>No Token Details Found</div>
        <div style={{ fontSize: '16px', marginBottom: '20px', maxWidth: '80%', textAlign: 'center' }}>
          We couldn't find data for this token.
        </div>
        <button 
          onClick={() => window.history.back()} 
          style={{ 
            padding: '10px 20px', 
            background: '#ffb300', 
            color: '#000000', 
            border: 'none', 
            borderRadius: '6px', 
            cursor: 'pointer',
            marginTop: '20px',
            fontSize: '16px',
            fontFamily: "'Chewy', cursive"
          }}
        >
          ← Go Back
        </button>
      </div>
    );
  }

  // Use the poolAddress (from MongoDB) for the DexScreener embed URL
  const dexScreenerEmbedUrl = `https://dexscreener.com/base/${poolAddress}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartDefaultOnMobile=1&chartTheme=dark&theme=light&chartStyle=0&chartType=usd&interval=15`;
  
  // Main content with enhanced loading states
  return (
    <>
      {/* Full-screen black background that's always visible */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#000000',
        zIndex: -1
      }}></div>
      
      <div className="token-detail-page">
        <div className="token-detail-header">
          <button 
            onClick={() => window.history.back()} 
            className="back-button"
          >
            ← Back
          </button>
          <h1 style={{ color: '#ffb300', fontFamily: "'Chewy', cursive" }}>{tokenDetails.name} ({tokenDetails.symbol})</h1>
          <div className="token-details-summary">
            <p>Price: {formatCurrency(tokenDetails.price_usd)}</p>
            <p>Market Cap: {formatCurrency(tokenDetails.fdv_usd)}</p>
            <p>24h Volume: {formatCurrency(tokenDetails.volume_usd)}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <p style={{ marginRight: '10px' }}>Contract: {tokenDetails.contractAddress.slice(0, 6)}...{tokenDetails.contractAddress.slice(-4)}</p>
              <button
                onClick={() => copyToClipboard(tokenDetails.contractAddress)}
                style={{
                  background: '#333',
                  color: '#ffb300',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontFamily: "'Chewy', cursive"
                }}
              >
                Copy
              </button>
            </div>
          </div>
          
          {/* Data source indicator */}
          {dataSource && (
            <div style={{
              display: 'inline-block',
              background: '#222',
              color: dataSource === 'websocket' ? '#00ff88' : '#ff9900',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              marginTop: '10px'
            }}>
              <span style={{ 
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: dataSource === 'websocket' ? '#00ff88' : '#ff9900',
                marginRight: '6px'
              }}></span>
              {dataSource === 'websocket' ? 'Live Data' : 'Static Data'}
            </div>
          )}
        </div>
        <div className="token-chart-container">
          {isLoadingChart && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: '#ffb300',
              zIndex: 5,
              textAlign: 'center'
            }}>
              <div>Loading chart...</div>
              <div className="loading-spinner" style={{ 
                margin: '20px auto', 
                width: '30px', 
                height: '30px',
                borderTopColor: '#ffb300' 
              }}></div>
            </div>
          )}
          <style>
            {`
              #dexscreener-embed {
                position: relative;
                width: 100%;
                padding-bottom: 125%;
              }
              @media(min-width:1400px) {
                #dexscreener-embed {
                  padding-bottom: 70%;
                }
              }
              #dexscreener-embed iframe {
                position: absolute;
                width: 100%;
                height: 100%;
                top: 0;
                left: 0;
                border: 0;
                background-color: #000;
              }
              .loading-spinner {
                border: 4px solid rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                border-top: 4px solid #ffb300;
                width: 24px;
                height: 24px;
                animation: spin 1s linear infinite;
              }
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}
          </style>
          <div id="dexscreener-embed">
            <iframe 
              src={dexScreenerEmbedUrl}
              onLoad={handleChartLoad}
              title={`${tokenDetails.name} price chart`}
            ></iframe>
          </div>
        </div>
        
        {/* Bottom margin for better spacing */}
        <div style={{ height: '50px' }}></div>
      </div>
    </>
  );
}

export default TokenDetailPage;