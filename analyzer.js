const fs = require('fs');
const todayFixtures = require('./today.json');
const tomorrowFixtures = require('./tomorrow.json');

// Extract total goals from score string
function extractTotalGoals(scoreStr) {
  const match = scoreStr.match(/(\d+)\s*-\s*(\d+)/);
  if (!match) return null;
  return parseInt(match[1], 10) + parseInt(match[2], 10);
}

// Parse score string and determine actual winner based on team names
function getWinnerFromScore(scoreStr, home, away) {
  const match = scoreStr.match(/^(.+?)\s+(\d+)\s*-\s*(\d+)\s+(.+)$/);
  if (!match) return null;

  const team1 = match[1].trim();
  const goals1 = parseInt(match[2], 10);
  const goals2 = parseInt(match[3], 10);
  const team2 = match[4].trim();

  if (goals1 > goals2) return team1;
  if (goals2 > goals1) return team2;
  return 'draw';
}

// Process fixtures and generate analysis
function analyzeFixtures(fixtures) {
  const output = {
    "OVER 1.5 STARTED HERE": [],
    "OVER 2.5 STARTED HERE": [],
    "OVER 3.5 STARTED HERE": [],
    "WIN STARTED HERE": []
  };

  fixtures.matches.forEach(({ teams, h2h }) => {
    if (!Array.isArray(h2h)) return;

    const [homeTeam, awayTeam] = teams.split(' vs ');
    const goals = h2h.map(item => extractTotalGoals(item.Score));
    const total = goals.length;

    if (goals.includes(null)) return;

    // WIN logic
    if (total >= 3) {
      let homeWins = 0;
      let awayWins = 0;

      h2h.forEach(item => {
        const winner = getWinnerFromScore(item.Score, homeTeam, awayTeam);
        if (winner === homeTeam) homeWins++;
        else if (winner === awayTeam) awayWins++;
      });

      if (homeWins === total) {
        output["WIN STARTED HERE"].push({
          teams,
          winner: homeTeam,
          analysis: `${homeTeam} won all ${total}/${total} H2H matches`
        });
      } else if (awayWins === total) {
        output["WIN STARTED HERE"].push({
          teams,
          winner: awayTeam,
          analysis: `${awayTeam} won all ${total}/${total} H2H matches`
        });
      }
    }

    // OVER 3.5
    if (total >= 3 && goals.every(g => g > 3.5)) {
      output["OVER 3.5 STARTED HERE"].push({
        teams,
        analysis: `All ${total}/${total} H2H are over 3.5 Goals`
      });
      return;
    }

    // OVER 2.5
    if (total >= 3 && goals.every(g => g > 2.5)) {
      output["OVER 2.5 STARTED HERE"].push({
        teams,
        analysis: `All ${total}/${total} H2H are over 2.5 Goals`
      });
      return;
    }

    // OVER 1.5
    if (total >= 5 && goals.every(g => g > 1.5)) {
      output["OVER 1.5 STARTED HERE"].push({
        teams,
        analysis: `All ${total}/${total} H2H are over 1.5 Goals`
      });
    }
  });

  return output;
}

// Save output to JSON and TXT files
function saveOutput(output, jsonFileName, txtFileName) {
  // Write JSON file
  fs.writeFileSync(jsonFileName, JSON.stringify(output, null, 2));

  // Write TXT file
  let textOutput = '';
  Object.entries(output).forEach(([category, entries]) => {
    textOutput += `${category}\n\n`;
    entries.forEach(entry => {
      textOutput += `Teams: ${entry.teams}\n`;
      textOutput += `Analysis: ${entry.analysis}\n`;
      if (entry.winner) textOutput += `Winner: ${entry.winner}\n`;
      textOutput += '\n';
    });
  });
  fs.writeFileSync(txtFileName, textOutput.trim());
}

// Process both today and tomorrow fixtures
const todayOutput = analyzeFixtures(todayFixtures);
const tomorrowOutput = analyzeFixtures(tomorrowFixtures);

// Save outputs
saveOutput(todayOutput, 'today_analysis.json', 'today_analysis.txt');
saveOutput(tomorrowOutput, 'tomorrow_analysis.json', 'tomorrow_analysis.txt');

console.log("Analysis completed. Files saved: 'today_analysis.json', 'today_analysis.txt', 'tomorrow_analysis.json', 'tomorrow_analysis.txt'");
