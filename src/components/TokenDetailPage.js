import axios from 'axios';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWebSocket } from '../context/WebSocketContext';

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
  
  // Use the shared WebSocket context
  const { isConnected, emit, addListener, removeListener } = useWebSocket();
  
  // Track if component is mounted
  const isMounted = useRef(true);
  const dataRequested = useRef(false);
  
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
  
  // Add this effect to apply the black background to the page
  useEffect(() => {
    // Save the original background
    const originalBodyBackground = document.body.style.background;
    const originalBodyBackgroundColor = document.body.style.backgroundColor;
    
    // Apply black background to body
    document.body.style.background = 'none';
    document.body.style.backgroundColor = '#000000';
    
    // Cleanup when component unmounts
    return () => {
      // Restore original background
      document.body.style.background = originalBodyBackground;
      document.body.style.backgroundColor = originalBodyBackgroundColor;
    };
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

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
      setError(err.message || 'An error occurred');
      setLoading(false);
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
    } else if (!isConnected) {
      console.log('WebSocket not connected, will retry or fallback to HTTP');
      // Will try HTTP after timeout if WebSocket doesn't connect
    }
    
    // Set timeout for fallback
    const timeoutId = setTimeout(() => {
      if (isMounted.current && loading && !tokenDetails) {
        console.log('WebSocket request timeout - falling back to HTTP');
        fallbackToHttp();
      }
    }, 5000);
    
    // Clean up
    return () => {
      clearTimeout(timeoutId);
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
  
  // HTTP fallback function
  const fallbackToHttp = async () => {
    // Only proceed if we're still loading and don't have data yet
    if (!isMounted.current || !loading || tokenDetails) return;
    
    console.log('Falling back to HTTP request');
    try {
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

  // Handler for chart loading
  const handleChartLoad = () => {
    console.log('Chart iframe loaded');
    setIsLoadingChart(false);
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
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 999
      }}>
        <div style={{ fontSize: '18px', marginBottom: '10px' }}>Loading token data...</div>
        <div className="loading-spinner" style={{ width: '40px', height: '40px' }}></div>
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
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 999
      }}>
        <div style={{ fontSize: '18px', marginBottom: '10px' }}>Error: {error}</div>
        <button 
          onClick={() => window.history.back()} 
          style={{ 
            padding: '8px 16px', 
            background: '#333', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px', 
            cursor: 'pointer',
            marginTop: '20px'
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
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 999
      }}>
        <div style={{ fontSize: '18px', marginBottom: '10px' }}>No token details found</div>
        <button 
          onClick={() => window.history.back()} 
          style={{ 
            padding: '8px 16px', 
            background: '#333', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px', 
            cursor: 'pointer',
            marginTop: '20px'
          }}
        >
          ← Go Back
        </button>
      </div>
    );
  }

  // Use the poolAddress (from MongoDB) for the DexScreener embed URL
  const dexScreenerEmbedUrl = `https://dexscreener.com/base/${poolAddress}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartDefaultOnMobile=1&chartTheme=dark&theme=light&chartStyle=0&chartType=usd&interval=15`;
  
  // Log the URL for debugging
  console.log("DexScreener URL:", dexScreenerEmbedUrl);

  // Main content with enhanced loading states
  return (
    <>
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
          <h1>{tokenDetails.name} ({tokenDetails.symbol})</h1>
          <div className="token-details-summary">
            <p>Price: {formatCurrency(tokenDetails.price_usd)}</p>
            <p>Market Cap: {formatCurrency(tokenDetails.fdv_usd)}</p>
            <p>24h Volume: {formatCurrency(tokenDetails.volume_usd)}</p>
            <p>Contract: {tokenDetails.contractAddress}</p>
          </div>
        </div>
        <div className="token-chart-container">
          {isLoadingChart && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: 'white',
              zIndex: 5,
              textAlign: 'center'
            }}>
              <div>Loading chart...</div>
              <div className="loading-spinner" style={{ margin: '20px auto', width: '30px', height: '30px' }}></div>
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
                border-top: 4px solid white;
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
            ></iframe>
          </div>
        </div>
      </div>
    </>
  );
}

export default TokenDetailPage;