const axios = require('axios');
const fs = require('fs').promises;
const chalk = require('chalk'); // Using v4.1.2
const figlet = require('figlet');
const fsSync = require('fs'); // For synchronous file operations (write stream)
const { execSync } = require('child_process'); // For running finder.js

// Create write streams for today.txt and tomorrow.txt (append mode)
const todayLogStream = fsSync.createWriteStream('today.txt', { flags: 'a' });
const tomorrowLogStream = fsSync.createWriteStream('tomorrow.txt', { flags: 'a' });

// Store the original console.log
const originalConsoleLog = console.log;

// Function to set the active log stream
let activeLogStream = todayLogStream;

// Override console.log to write to both terminal and the active log file
console.log = function (...args) {
    originalConsoleLog.apply(console, args);
    const plainText = args.map(arg => {
        if (typeof arg === 'string') {
            return arg.replace(/\x1b\[[0-9;]*m/g, '');
        }
        return arg;
    }).join(' ');
    activeLogStream.write(plainText + '\n');
};

function getTodayDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`; // e.g., "2025-06-12"
}

function formatMatchDate(dateString) {
    if (!dateString || dateString.length < 8) return "unknown";
    const year = dateString.slice(0, 4).slice(-2);
    const month = dateString.slice(4, 6);
    const day = dateString.slice(6, 8);
    return `${day}.${month}.${year}`; // e.g., "12.06.25"
}

function getTomorrowDate() {
    const today = new Date();
    today.setDate(today.getDate() + 1);
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}${month}${day}`; // e.g., "20250613"
}

// Function to read the build ID from key.txt
async function getBuildIdFromFile() {
    try {
        const buildId = await fs.readFile('key.txt', 'utf8');
        const trimmedBuildId = buildId.trim();
        if (!trimmedBuildId) {
            throw new Error('key.txt is empty');
        }
        console.log(chalk.green(`Loaded build ID from key.txt: ${trimmedBuildId}`));
        return trimmedBuildId;
    } catch (error) {
        console.error(chalk.red(`Error reading key.txt: ${error.message}`));
        console.error(chalk.red('Please ensure key.txt exists and contains a valid build ID.'));
        process.exit(1); // Exit the script if key.txt cannot be read
    }
}

// Function to run finder.js
function runFinderScript() {
    try {
        console.log(chalk.blue('Running finder.js to update the key...'));
        execSync('node finder.js', { stdio: 'inherit' });
        console.log(chalk.green('finder.js executed successfully'));
    } catch (error) {
        console.error(chalk.red(`Error running finder.js: ${error.message}`));
        process.exit(1); // Exit if finder.js fails
    }
}

// Main scraping function
async function mainScrape(scrapeDate, dateLabel, jsonFile, logStream) {
    activeLogStream = logStream; // Set the active log stream for this scrape
    let urlCount = 0;
    const allUrls = [];
    const fixturesData = {
        "date": dateLabel === 'today' ? getTodayDate() : getTodayDate().replace(/\d{2}$/, String(parseInt(getTodayDate().slice(-2)) + 1)),
        "total_matches": 0,
        "matches": []
    };

    // Get the build ID from key.txt
    const buildId = await getBuildIdFromFile();

    // Define the URL with the selected date
    const url = `https://prod-cdn-mev-api.livescore.com/v1/api/app/date/soccer/${scrapeDate}/0?countryCode=NG&locale=en&MD=1`;

    try {
        const response = await axios.get(url);
        const data = response.data;

        if (!data?.Stages?.length) {
            console.log(chalk.red(`No Fixtures found for ${dateLabel}`));
            return fixturesData; // Return empty fixturesData to save
        }

        data.Stages.forEach(stage => {
            const cnmT = stage.CnmT || "unknown";
            const scd = stage.Scd || "unknown";

            if (!stage.Events?.length) return;

            stage.Events.forEach(event => {
                const t1Name = event.T1?.[0]?.Nm || "unknown";
                const t2Name = event.T2?.[0]?.Nm || "unknown";

                if (event.Pids) {
                    Object.keys(event.Pids).forEach(key => {
                        if (key === "8") {
                            const pidsValue = event.Pids[key] || "unknown";
                            const newUrl = `https://www.livescore.com/_next/data/${buildId}/en/football/${cnmT}/${scd}/${t1Name}-vs-${t2Name}/${pidsValue}/h2h.json`;
                            urlCount++;
                            allUrls.push({ url: newUrl, team1: t1Name, team2: t2Name });
                        }
                    });
                }
            });
        });

        console.log(chalk.magenta(`Total Matches Found for ${dateLabel}: `) + urlCount);
        fixturesData.total_matches = urlCount;

        if (!allUrls.length) {
            console.log(chalk.red(`No Matches Found for ${dateLabel}`));
            return fixturesData;
        }

        const saveFixturesData = async () => {
            try {
                await fs.writeFile(jsonFile, JSON.stringify(fixturesData, null, 2));
                console.log(chalk.magenta(`${jsonFile} updated`));
            } catch (error) {
                console.error(chalk.red(`Error saving ${jsonFile}: `) + error.message);
            }
        };

        let consecutiveFailures = 0;

        const processUrl = async (urlIndex) => {
            if (urlIndex >= allUrls.length) {
                console.log(chalk.magenta(`All Fixtures processed for ${dateLabel}`));
                await saveFixturesData();
                return;
            }

            const { url: currentUrl, team1, team2 } = allUrls[urlIndex];
            console.log(chalk.blue(`\nProcessing Fixtures ${urlIndex + 1} for ${dateLabel}: `) + `${team1} vs ${team2}`);

            try {
                const response = await axios.get(currentUrl);
                const h2hData = response.data;

                const matchData = {};
                let hasData = false;

                const metaParams = h2hData?.pageProps?.layoutContext?.metaParams;
                if (metaParams) {
                    const team1 = metaParams.team1 || "unknown";
                    const team2 = metaParams.team2 || "unknown";
                    matchData.teams = `${team1} vs ${team2}`;
                    console.log(chalk.cyan(`"${team1}" vs "${team2}"`));
                } else {
                    matchData.teams = "unknown vs unknown";
                    console.log(chalk.red('metaParams not found'));
                }

                const headToHead = h2hData?.pageProps?.initialEventData?.event?.headToHead?.h2h;
                if (headToHead?.length) {
                    matchData.h2h = [];
                    let h2hCounter = 1;
                    headToHead.forEach(h2hGroup => {
                        if (h2hGroup.events?.length) {
                            hasData = true;
                            h2hGroup.events.forEach(event => {
                                const stageName = event.stage?.stageName || "unknown";
                                const homeTeam = event.homeName || "unknown";
                                const awayTeam = event.awayName || "unknown";
                                const homeScore = event.homeScore || "0";
                                const awayScore = event.awayScore || "0";
                                const matchDate = formatMatchDate(event.startDateTimeString);

                                console.log(chalk.white.bold(`H2H ${h2hCounter}:`));
                                console.log(chalk.green(`Stage Name: ${stageName}`));
                                console.log(chalk.yellow(`Score: ${homeTeam} ${homeScore} - ${awayScore} ${awayTeam}`));

                                matchData.h2h.push({
                                    "Score": `${homeTeam} ${homeScore} - ${awayScore} ${awayTeam}`,
                                    "Stage Name": stageName,
                                    "date": matchDate
                                });
                                h2hCounter++;
                            });
                        }
                    });
                } else {
                    console.log(chalk.red('No H2H data found'));
                }

                const homeData = h2hData?.pageProps?.initialEventData?.event?.headToHead?.home;
                if (homeData?.length) {
                    matchData["Home last matches"] = [];
                    console.log(chalk.blue('\nHome last matches:'));
                    let hlmCounter = 1;
                    homeData.forEach(homeGroup => {
                        if (homeGroup.events?.length) {
                            homeGroup.events.forEach(event => {
                                const stageName = event.stage?.stageName || "unknown";
                                const homeTeam = event.homeName || "unknown";
                                const awayTeam = event.awayName || "unknown";
                                const homeScore = event.homeScore || "0";
                                const awayScore = event.awayScore || "0";
                                const matchDate = formatMatchDate(event.startDateTimeString);

                                console.log(chalk.white.bold(`HLM ${hlmCounter}:`));
                                console.log(chalk.green(`Stage Name: ${stageName}`));
                                console.log(chalk.yellow(`Score: ${homeTeam} ${homeScore} - ${awayScore} ${awayTeam}`));

                                matchData["Home last matches"].push({
                                    "Score": `${homeTeam} ${homeScore} - ${awayScore} ${awayTeam}`,
                                    "Stage Name": stageName,
                                    "date": matchDate
                                });
                                hlmCounter++;
                            });
                            hasData = true;
                        }
                    });
                } else {
                    console.log(chalk.red('No Home last matches found'));
                }

                const awayData = h2hData?.pageProps?.initialEventData?.event?.headToHead?.away;
                if (awayData?.length) {
                    matchData["Away last matches"] = [];
                    console.log(chalk.blue('\nAway last matches:'));
                    let almCounter = 1;
                    awayData.forEach(awayGroup => {
                        if (awayGroup.events?.length) {
                            awayGroup.events.forEach(event => {
                                const stageName = event.stage?.stageName || "unknown";
                                const homeTeam = event.homeName || "unknown";
                                const awayTeam = event.awayName || "unknown";
                                const homeScore = event.homeScore || "0";
                                const awayScore = event.awayScore || "0";
                                const matchDate = formatMatchDate(event.startDateTimeString);

                                console.log(chalk.white.bold(`ALM ${almCounter}:`));
                                console.log(chalk.green(`Stage Name: ${stageName}`));
                                console.log(chalk.yellow(`Score: ${homeTeam} ${homeScore} - ${awayScore} ${awayTeam}`));

                                matchData["Away last matches"].push({
                                    "Score": `${homeTeam} ${homeScore} - ${awayScore} ${awayTeam}`,
                                    "Stage Name": stageName,
                                    "date": matchDate
                                });
                                almCounter++;
                            });
                            hasData = true;
                        }
                    });
                } else {
                    console.log(chalk.red('No Away last matches found'));
                }

                if (hasData) {
                    fixturesData.matches.push(matchData);
                    consecutiveFailures = 0; // Reset counter on success
                    await saveFixturesData();
                } else {
                    console.log(chalk.red(`No H2H, Home, or Away data found for this URL for ${dateLabel}`));
                    consecutiveFailures++;
                    if (consecutiveFailures >= 5) {
                        console.log(chalk.red(`Too many failures for ${dateLabel}, updating key...`));
                        runFinderScript();
                        console.log(chalk.blue(`Restarting scraping process for ${dateLabel} with new key...`));
                        return mainScrape(scrapeDate, dateLabel, jsonFile, logStream); // Restart for this date
                    }
                    await saveFixturesData();
                }

                await processUrl(urlIndex + 1);
            } catch (error) {
                console.log(chalk.red(`Skipping URL ${urlIndex + 1} for ${dateLabel} due to error: ${error.message}`));
                consecutiveFailures++;
                if (consecutiveFailures >= 5) {
                    console.log(chalk.red(`Too many failures for ${dateLabel}, updating key...`));
                    runFinderScript();
                    console.log(chalk.blue(`Restarting scraping process for ${dateLabel} with new key...`));
                    return mainScrape(scrapeDate, dateLabel, jsonFile, logStream); // Restart for this date
                }
                await saveFixturesData();
                await processUrl(urlIndex + 1);
            }
        };

        await processUrl(0);
        return fixturesData;
    } catch (error) {
        console.error(chalk.red(`Error in first API call for ${dateLabel}: `) + error.message);
        return fixturesData;
    }
}

// Function to scrape both today and tomorrow
async function scrapeBothDays() {
    // Scrape today's fixtures
    console.log(chalk.white.bold('=== Scraping Today\'s Fixtures ==='));
    await mainScrape(getTodayDate().replace(/-/g, ''), 'today', 'today.json', todayLogStream);

    // Scrape tomorrow's fixtures
    console.log(chalk.white.bold('=== Scraping Tomorrow\'s Fixtures ==='));
    await mainScrape(getTomorrowDate(), 'tomorrow', 'tomorrow.json', tomorrowLogStream);
}

// Display the large script name and title
console.log(chalk.white.bold(figlet.textSync('Football Fixtures Scraper by Qring', { font: 'Standard' })));
console.log(chalk.white.bold('=== FOOTBALL FIXTURES SCRAPER ==='));

// Start the scraping process
scrapeBothDays();

// Close the log streams when the script exits
process.on('exit', () => {
    todayLogStream.end();
    tomorrowLogStream.end();
});
