document.addEventListener('DOMContentLoaded', function() {
        // DOM elements
        const stockForm = document.getElementById('stockForm');
        const dashboard = document.getElementById('dashboard');
        const errorMsg = document.getElementById('errorMsg');
        const submitBtn = document.getElementById('submitBtn');
        const demoWarning = document.getElementById('demoWarning');     
        // API Key and usage tracking
        const API_KEY = 'HTPWM70R9Y2U0OQF';
        let apiCallCount = 0;
        const MAX_API_CALLS = 5;
        const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache
        let stockCache = {};
        
        // Set max date to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('date').setAttribute('max', today);
        
        // Form submission handler
        stockForm.addEventListener('submit', async function(e) {
            // prevents default behaviour
            e.preventDefault();
            
            // Get form values
            const symbol = document.getElementById('name').value.toUpperCase();
            const purchaseDate = document.getElementById('date').value;
            const units = document.getElementById('units').value;
            
            // Validate form
            if (!symbol || !purchaseDate || !units) {
                showError('Please fill all fields');
                return;
            }
            
            // Show loading state, prevents multiple send requests
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<div class="loader"></div> Loading...';
            
            try {
                // Show dashboard
                dashboard.classList.remove('hidden');
                errorMsg.classList.add('hidden');
                demoWarning.classList.add('hidden');
                
                // cached data
                const cacheKey = `${symbol}-${purchaseDate}`;
                // func call
                const cachedData = getFromCache(cacheKey);
                
                if (cachedData && (Date.now() - cachedData.timestamp) < CACHE_DURATION) {
                    // Use cached data
                    updateUIWithData(cachedData.data, symbol, purchaseDate, units);
                } else if (apiCallCount < MAX_API_CALLS) {
                    // Fetch live data from API
                    await updateStockData(symbol, purchaseDate, units);
                    apiCallCount++;
                    document.getElementById('apiInfo').textContent = 
                        `API Calls: ${apiCallCount}/${MAX_API_CALLS} (Live data)`;
                } else {
                    // Use demo data when API limit is reached
                    showDemoData(symbol, purchaseDate, units);
                    document.getElementById('apiInfo').innerHTML = 
                        `<i class="fas fa-exclamation-triangle"></i> API Limit Reached: Using demo data`;
                }
            } catch (error) {
                showError(error.message || 'Failed to fetch data. Please try again.');
            } finally {
                // Reset button state
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-search"></i> Check';
            }
        });

        // Function to show error message
        function showError(message) {
            errorMsg.textContent = message;
            errorMsg.classList.remove('hidden');
        }

        // Cache management functions
        function getFromCache(key) {
            return stockCache[key];
        }
        
        function addToCache(key, data) {
            stockCache[key] = {
                data: data,
                timestamp: Date.now()
            };
        }

        // Function to fetch stock data from Alpha Vantage
        async function fetchStockData(symbol) {
            try {
                // First, check if the symbol is valid by fetching quote
                const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`;
                const quoteResponse = await fetch(quoteUrl);
                
                if (!quoteResponse.ok) {
                    throw new Error('Network response was not ok');
                }
                
                const quoteData = await quoteResponse.json();
                
                if (quoteData['Note']) {
                    throw new Error('API rate limit exceeded');
                }
                
                if (!quoteData['Global Quote'] || !quoteData['Global Quote']['05. price']) {
                    throw new Error('Invalid stock symbol or no data available');
                }
                
                // Then fetch time series data for chart and indicators
                const timeSeriesUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${API_KEY}`;
                const timeSeriesResponse = await fetch(timeSeriesUrl);
                
                if (!timeSeriesResponse.ok) {
                    throw new Error('Network response was not ok');
                }
                
                const timeSeriesData = await timeSeriesResponse.json();
                
                if (timeSeriesData['Note']) {
                    throw new Error('API rate limit exceeded');
                }
                
                if (!timeSeriesData['Time Series (Daily)']) {
                    throw new Error('Unable to fetch historical data');
                }
                
                return {
                    quote: quoteData['Global Quote'],
                    timeSeries: timeSeriesData['Time Series (Daily)']
                };
            } catch (error) {
                console.error('API Error:', error);
                throw new Error('Failed to fetch stock data. ' + error.message);
            }
        }

        // Function to calculate moving averages
        function calculateMovingAverages(timeSeriesData, days) {
            const closingPrices = Object.values(timeSeriesData)
                .slice(0, days)
                .map(day => parseFloat(day['4. close']));
            
            return (closingPrices.reduce((sum, price) => sum + price, 0) / days).toFixed(2);
        }

        // Function to get historical price for a specific date
        function getHistoricalPrice(timeSeriesData, date) {
            // Try to find the price for the exact date
            if (timeSeriesData[date]) {
                return parseFloat(timeSeriesData[date]['4. close']);
            }
            
            // If not available, find the closest previous trading day
            const dates = Object.keys(timeSeriesData).sort((a, b) => new Date(b) - new Date(a));
            const purchaseDateObj = new Date(date);
            
            for (const d of dates) {
                const currentDateObj = new Date(d);
                if (currentDateObj <= purchaseDateObj) {
                    return parseFloat(timeSeriesData[d]['4. close']);
                }
            }
            
            throw new Error('Purchase date is too far in the past or no data available');
        }

        // Function to update stock data
        async function updateStockData(symbol, purchaseDate, units) {
            try {
                const stockData = await fetchStockData(symbol);
                const quote = stockData.quote;
                const timeSeries = stockData.timeSeries;
                
                // Get current and purchase prices
                const currentPrice = parseFloat(quote['05. price']);
                const purchasePrice = getHistoricalPrice(timeSeries, purchaseDate);
                
                // Calculate values
                const investmentValue = (units * purchasePrice).toFixed(2);
                const dailyChange = parseFloat(quote['10. change percent']).toFixed(2);
                
                // Calculate moving averages
                const avg7 = calculateMovingAverages(timeSeries, 7);
                const avg30 = calculateMovingAverages(timeSeries, 30);
                
                // Prepare data for UI and caching
                const dataForUI = {
                    currentPrice,
                    purchasePrice,
                    units,
                    investmentValue,
                    dailyChange,
                    avg7,
                    avg30,
                    timeSeries
                };
                
                // Cache the data
                const cacheKey = `${symbol}-${purchaseDate}`;
                addToCache(cacheKey, dataForUI);
                
                // Update the UI
                updateUIWithData(dataForUI, symbol, purchaseDate, units);
                
            } catch (error) {
                // If API fails, fall back to demo data
                showDemoData(symbol, purchaseDate, units);
                throw error;
            }
        }

        // Function to update UI with data
        function updateUIWithData(data, symbol, purchaseDate, units) {
            // Update the DOM
            document.getElementById('stockName').textContent = symbol;
            document.getElementById('currentPrice').textContent = data.currentPrice.toFixed(2);
            document.getElementById('purchasePrice').textContent = data.purchasePrice.toFixed(2);
            document.getElementById('unitsDisplay').textContent = units;
            document.getElementById('investmentValue').textContent = data.investmentValue;
            
            // Update indicators
            document.getElementById('dailyChange').textContent = `${data.dailyChange}%`;
            document.getElementById('dailyChange').className = data.dailyChange >= 0 ? 'positive' : 'negative';
            document.getElementById('avg7').textContent = data.avg7;
            document.getElementById('avg30').textContent = data.avg30;
            
            // Update market sentiment
            updateMarketSentiment(data.dailyChange);
            
            // Render chart
            renderChart(symbol, data.timeSeries);
        }

        // Function to show demo data when API limits are reached
        function showDemoData(symbol, purchaseDate, units) {
            demoWarning.classList.remove('hidden');
            
            // Generate realistic demo data
            const currentPrice = (Math.random() * 400 + 50).toFixed(2);
            const purchasePrice = (currentPrice * (0.7 + Math.random() * 0.6)).toFixed(2);
            const investmentValue = (units * purchasePrice).toFixed(2);
            const dailyChange = (Math.random() * 10 - 3).toFixed(2);
            const avg7 = (currentPrice * (1 + (Math.random() * 0.08 - 0.04))).toFixed(2);
            const avg30 = (currentPrice * (1 + (Math.random() * 0.1 - 0.05))).toFixed(2);
            
            // Create mock time series data
            const mockTimeSeries = {};
            let basePrice = parseFloat(currentPrice);
            const dates = [];
            
            for (let i = 30; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                
                // Generate random price movement
                basePrice += basePrice * (Math.random() * 0.05 - 0.025);
                
                mockTimeSeries[dateStr] = {
                    '1. open': (basePrice * (0.99 + Math.random() * 0.02)).toFixed(4),
                    '2. high': (basePrice * (1 + Math.random() * 0.02)).toFixed(4),
                    '3. low': (basePrice * (0.98 - Math.random() * 0.02)).toFixed(4),
                    '4. close': basePrice.toFixed(4),
                    '5. volume': Math.floor(Math.random() * 10000000).toString()
                };
                
                dates.push(dateStr);
            }
            
            // Update the DOM with demo data
            document.getElementById('stockName').textContent = symbol + " (Demo)";
            document.getElementById('currentPrice').textContent = currentPrice;
            document.getElementById('purchasePrice').textContent = purchasePrice;
            document.getElementById('unitsDisplay').textContent = units;
            document.getElementById('investmentValue').textContent = investmentValue;
            
            // Update indicators
            document.getElementById('dailyChange').textContent = `${dailyChange}%`;
            document.getElementById('dailyChange').className = dailyChange >= 0 ? 'positive' : 'negative';
            document.getElementById('avg7').textContent = avg7;
            document.getElementById('avg30').textContent = avg30;
            
            // Update market sentiment
            updateMarketSentiment(dailyChange);
            
            // Render chart with demo data
            renderChart(symbol, mockTimeSeries);
        }

        // Function to update market sentiment
        function updateMarketSentiment(dailyChange) {
            const sentimentValue = document.getElementById('sentimentValue');
            
            if (dailyChange > 5) {
                sentimentValue.textContent = 'Very Bullish';
                sentimentValue.className = 'positive';
            } else if (dailyChange > 2) {
                sentimentValue.textContent = 'Bullish';
                sentimentValue.className = 'positive';
            } else if (dailyChange < -5) {
                sentimentValue.textContent = 'Very Bearish';
                sentimentValue.className = 'negative';
            } else if (dailyChange < -2) {
                sentimentValue.textContent = 'Bearish';
                sentimentValue.className = 'negative';
            } else {
                sentimentValue.textContent = 'Neutral';
                sentimentValue.className = '';
            }
        }
        // Function to render the chart
        function renderChart(symbol, timeSeriesData) {
            const ctx = document.getElementById('priceChart').getContext('2d');
            
            // Process time series data for chart
            const dates = Object.keys(timeSeriesData).slice(0, 30).reverse();
            const prices = dates.map(date => parseFloat(timeSeriesData[date]['4. close']));
            
            // Destroy previous chart if it exists
            if (window.priceChartInstance) {
                window.priceChartInstance.destroy();
            }            
            // Create new chart
            window.priceChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: dates,
                    datasets: [{
                        label: symbol + ' Closing Price',
                        data: prices,
                        borderColor: '#6c5ce7',
                        backgroundColor: 'rgba(108, 92, 231, 0.1)',
                        borderWidth: 2,
                        pointRadius: 2,
                        pointBackgroundColor: '#6c5ce7',
                        fill: true,
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: {
                                color: '#e0e0e0'
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: false,
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            },
                            ticks: {
                                color: '#e0e0e0',
                                callback: function(value) {
                                    return '$' + value;
                                }
                            }
                        },
                        x: {
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            },
                            ticks: {
                                color: '#e0e0e0',
                                maxTicksLimit: 10
                            }
                        }
                    }
                }
            });
        }
        // Initialize with sample data for demo purposes
        setTimeout(() => {
            document.getElementById('name').value = 'AAPL';
            document.getElementById('date').value = '2025-06-01';
            document.getElementById('units').value = '10';
        }, 500);
    });
