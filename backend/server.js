require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;

// =========================================================================
// CORS Configuration (Optimized for local dev and Vercel deployments)
// =========================================================================
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow any origin dynamically (crucial for local tunnels like ngrok and Vercel environments)
    callback(null, true);
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

// =========================================================================
// Database Connection Pool
// =========================================================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test connection and run migrations on startup
pool.query('SELECT NOW()')
  .then(async res => {
    console.log(`[Database] Connected successfully. DB Server Time: ${res.rows[0].now}`);
    
    try {
      // 1. Add column flag_code to teams table if it doesn't exist
      await pool.query('ALTER TABLE teams ADD COLUMN IF NOT EXISTS flag_code VARCHAR(10) DEFAULT NULL;');
      console.log('[Migration] Column flag_code verified/added.');

      // 2. Seed National Teams if they do not exist
      const nationalTeams = [
        { name: 'Франція', league: 'Збірні', attack: 86, midfield: 84, defense: 84, overall: 85, flag_code: 'fr', players: ['Kylian Mbappe', 'Antoine Griezmann', 'Ousmane Dembele', 'Marcus Thuram'] },
        { name: 'Англія', league: 'Збірні', attack: 85, midfield: 85, defense: 83, overall: 84, flag_code: 'gb-eng', players: ['Harry Kane', 'Bukayo Saka', 'Jude Bellingham', 'Phil Foden'] },
        { name: 'Аргентина', league: 'Збірні', attack: 84, midfield: 83, defense: 82, overall: 83, flag_code: 'ar', players: ['Lionel Messi', 'Julian Alvarez', 'Angel Di Maria', 'Lautaro Martinez'] },
        { name: 'Іспанія', league: 'Збірні', attack: 82, midfield: 85, defense: 82, overall: 83, flag_code: 'es', players: ['Rodri', 'Lamine Yamal', 'Alvaro Morata', 'Pedri'] },
        { name: 'Португалія', league: 'Збірні', attack: 84, midfield: 83, defense: 82, overall: 83, flag_code: 'pt', players: ['Cristiano Ronaldo', 'Bruno Fernandes', 'Bernardo Silva', 'Rafael Leao'] },
        { name: 'Німеччина', league: 'Збірні', attack: 81, midfield: 84, defense: 81, overall: 82, flag_code: 'de', players: ['Florian Wirtz', 'Jamal Musiala', 'Kai Havertz', 'Leroy Sane'] },
        { name: 'Бразилія', league: 'Збірні', attack: 83, midfield: 81, defense: 81, overall: 82, flag_code: 'br', players: ['Vinicius Junior', 'Rodrygo', 'Neymar Jr', 'Casemiro'] },
        { name: 'Італія', league: 'Збірні', attack: 80, midfield: 82, defense: 81, overall: 81, flag_code: 'it', players: ['Nicolo Barella', 'Federico Chiesa', 'Gianluigi Donnarumma', 'Alessandro Bastoni'] },
        { name: 'Нідерланди', league: 'Збірні', attack: 80, midfield: 81, defense: 83, overall: 81, flag_code: 'nl', players: ['Virgil van Dijk', 'Frenkie de Jong', 'Memphis Depay', 'Cody Gakpo'] },
        { name: 'Україна', league: 'Збірні', attack: 78, midfield: 77, defense: 75, overall: 77, flag_code: 'ua', players: ['Artem Dovbyk', 'Viktor Tsygankov', 'Mykhailo Mudryk', 'Oleksandr Zinchenko'] }
      ];

      for (const t of nationalTeams) {
        // Insert team
        const teamInsert = await pool.query(
          `INSERT INTO teams (name, league, attack, midfield, defense, overall, flag_code) 
           VALUES ($1, $2, $3, $4, $5, $6, $7) 
           ON CONFLICT (name) DO UPDATE SET flag_code = EXCLUDED.flag_code, overall = EXCLUDED.overall
           RETURNING id;`,
          [t.name, t.league, t.attack, t.midfield, t.defense, t.overall, t.flag_code]
        );
        const teamId = teamInsert.rows[0]?.id;
        
        if (teamId) {
          // Insert players
          for (const pName of t.players) {
            await pool.query(
              'INSERT INTO team_players (team_id, name) VALUES ($1, $2) ON CONFLICT (team_id, name) DO NOTHING;',
              [teamId, pName]
            );
          }
        }
      }
      console.log('[Migration] National teams and players seeded successfully.');
    } catch (migErr) {
      console.error('[Migration] Error running migration/seeding:', migErr);
    }
  })
  .catch(err => {
    console.error('[Database] Connection error:', err.message);
  });

// =========================================================================
// API Endpoints
// =========================================================================

// --- HEALTH CHECK ---
app.get('/api/health', async (req, res) => {
  try {
    const dbCheck = await pool.query('SELECT 1');
    res.json({
      status: 'OK',
      timestamp: new Date(),
      database: dbCheck.rowCount === 1 ? 'Connected' : 'Disconnected',
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date(),
      database: 'Error: ' + error.message
    });
  }
});

// =========================================================================
// 1. CRUD FOR TEAMS & TEAM_PLAYERS (REAL FOOTBALLERS)
// =========================================================================

// POST /api/teams - Create a team with a list of real players
app.post('/api/teams', async (req, res) => {
  const { name, league, attack, midfield, defense, overall, flag_code, players } = req.body;
  if (!name || !league) {
    return res.status(400).json({ error: 'Team name and league are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create Team
    const insertTeamQuery = `
      INSERT INTO teams (name, league, attack, midfield, defense, overall, flag_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const teamResult = await client.query(insertTeamQuery, [
      name,
      league,
      parseInt(attack) || 50,
      parseInt(midfield) || 50,
      parseInt(defense) || 50,
      parseInt(overall) || 50,
      flag_code ? flag_code.trim().toLowerCase() : null
    ]);
    const newTeam = teamResult.rows[0];

    // Add Players
    const insertedPlayers = [];
    if (Array.isArray(players) && players.length > 0) {
      const insertPlayerQuery = `
        INSERT INTO team_players (team_id, name)
        VALUES ($1, $2)
        RETURNING *;
      `;
      for (const playerName of players) {
        if (playerName && playerName.trim() !== '') {
          const playerResult = await client.query(insertPlayerQuery, [newTeam.id, playerName.trim()]);
          insertedPlayers.push(playerResult.rows[0]);
        }
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ ...newTeam, players: insertedPlayers });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in POST /api/teams:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Team with this name already exists' });
    }
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    client.release();
  }
});

// GET /api/teams - Get all teams grouped by league
app.get('/api/teams', async (req, res) => {
  try {
    const query = 'SELECT * FROM teams ORDER BY league ASC, overall DESC, name ASC;';
    const result = await pool.query(query);

    const grouped = {};
    result.rows.forEach(team => {
      if (!grouped[team.league]) {
        grouped[team.league] = [];
      }
      grouped[team.league].push(team);
    });

    res.json(grouped);
  } catch (error) {
    console.error('Error in GET /api/teams:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PUT /api/teams/:id - Update team details
app.put('/api/teams/:id', async (req, res) => {
  const { id } = req.params;
  const { name, league, attack, midfield, defense, overall } = req.body;
  try {
    const query = `
      UPDATE teams
      SET name = COALESCE($1, name),
          league = COALESCE($2, league),
          attack = COALESCE($3, attack),
          midfield = COALESCE($4, midfield),
          defense = COALESCE($5, defense),
          overall = COALESCE($6, overall)
      WHERE id = $7
      RETURNING *;
    `;
    const result = await pool.query(query, [
      name,
      league,
      attack !== undefined ? parseInt(attack) : null,
      midfield !== undefined ? parseInt(midfield) : null,
      defense !== undefined ? parseInt(defense) : null,
      overall !== undefined ? parseInt(overall) : null,
      id
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error in PUT /api/teams/:id:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /api/teams/:id - Delete a team
app.delete('/api/teams/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM teams WHERE id = $1 RETURNING *;', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }
    res.json({ message: 'Team and its squad roster deleted successfully', team: result.rows[0] });
  } catch (error) {
    console.error('Error in DELETE /api/teams/:id:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/teams/:id/players - Get all footballers in a team
app.get('/api/teams/:id/players', async (req, res) => {
  const { id } = req.params;
  try {
    const query = 'SELECT * FROM team_players WHERE team_id = $1 ORDER BY name ASC;';
    const result = await pool.query(query, [id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error in GET /api/teams/:id/players:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/teams/:id/players - Add a player to a team
app.post('/api/teams/:id/players', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Player name is required' });
  }
  try {
    const query = 'INSERT INTO team_players (team_id, name) VALUES ($1, $2) RETURNING *;';
    const result = await pool.query(query, [id, name.trim()]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error in POST /api/teams/:id/players:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PUT /api/team-players/:id - Update real player
app.put('/api/team-players/:id', async (req, res) => {
  const { id } = req.params;
  const { name, team_id } = req.body;
  try {
    const query = `
      UPDATE team_players
      SET name = COALESCE($1, name),
          team_id = COALESCE($2, team_id)
      WHERE id = $3
      RETURNING *;
    `;
    const result = await pool.query(query, [
      name,
      team_id !== undefined ? parseInt(team_id) : null,
      id
    ]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error in PUT /api/team-players/:id:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /api/team-players/:id - Delete a real player
app.delete('/api/team-players/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM team_players WHERE id = $1 RETURNING *;', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    res.json({ message: 'Player deleted successfully', player: result.rows[0] });
  } catch (error) {
    console.error('Error in DELETE /api/team-players/:id:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// =========================================================================
// 2. TOURNAMENT GENERATOR (BALANCED DRAFT)
// =========================================================================

// Helper function to shuffle array
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// POST /api/tournaments - Create balanced tournament
app.post('/api/tournaments', async (req, res) => {
  const { name, playerNames, type, N, teamIds } = req.body;

  // Validation
  if (!name || !playerNames || !type || !N || !teamIds) {
    return res.status(400).json({ error: 'name, playerNames, type, N, and teamIds are required' });
  }
  if (!Array.isArray(playerNames) || playerNames.length < 2) {
    return res.status(400).json({ error: 'playerNames must be an array of at least 2 players' });
  }
  
  const numPlayers = playerNames.length;
  const expectedTeamsCount = numPlayers * N;

  if (!Array.isArray(teamIds) || teamIds.length !== expectedTeamsCount) {
    return res.status(400).json({ error: `teamIds must contain exactly ${expectedTeamsCount} teams (number of players * N)` });
  }
  if (type !== 'Groups+Playoff' && type !== 'Playoff') {
    return res.status(400).json({ error: 'type must be either "Groups+Playoff" or "Playoff"' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Resolve human players IDs (create if missing)
    const playerIds = [];
    for (const pName of playerNames) {
      if (!pName || pName.trim() === '') continue;
      let playerRes = await client.query('SELECT id FROM players WHERE name = $1;', [pName.trim()]);
      if (playerRes.rowCount === 0) {
        playerRes = await client.query('INSERT INTO players (name) VALUES ($1) RETURNING id;', [pName.trim()]);
      }
      playerIds.push(playerRes.rows[0].id);
    }

    if (playerIds.length !== numPlayers) {
      throw new Error('Some player names were blank or duplicate.');
    }

    // 2. Retrieve selected teams
    const teamsRes = await client.query('SELECT id, name, overall FROM teams WHERE id = ANY($1);', [teamIds]);
    const teams = teamsRes.rows;
    if (teams.length !== expectedTeamsCount) {
      throw new Error(`Only ${teams.length} out of ${expectedTeamsCount} teams were found in the database.`);
    }

    // 3. Sort overall descending
    teams.sort((a, b) => b.overall - a.overall);

    // 4. Group into N pots of numPlayers teams each
    const pots = [];
    for (let i = 0; i < N; i++) {
      pots.push(teams.slice(i * numPlayers, (i + 1) * numPlayers));
    }

    // 5. Balanced random distribution:
    // For each pot, shuffle the teams and distribute to the players
    const assignments = []; // { teamId, playerId, potIndex }
    const playerTeams = {}; // playerId -> array of teams
    playerIds.forEach(id => playerTeams[id] = []);

    pots.forEach((pot, potIndex) => {
      const shuffledPot = shuffleArray(pot);
      playerIds.forEach((playerId, index) => {
        const team = shuffledPot[index];
        playerTeams[playerId].push(team);
        assignments.push({
          teamId: team.id,
          playerId: playerId,
          potIndex: potIndex
        });
      });
    });

    // 6. Create Tournament
    const tourneyRes = await client.query(
      'INSERT INTO tournaments (name, type) VALUES ($1, $2) RETURNING id;',
      [name.trim(), type]
    );
    const tournamentId = tourneyRes.rows[0].id;

    // 7. Insert Tournament Teams
    for (const assign of assignments) {
      await client.query(
        'INSERT INTO tournament_teams (tournament_id, team_id, original_player_id) VALUES ($1, $2, $3);',
        [tournamentId, assign.teamId, assign.playerId]
      );
    }

    // 8. Schedule matches based on type
    const matchesScheduled = [];

    if (type === 'Groups+Playoff') {
      // Generate N groups. Group A corresponds to Pot 0, Group B to Pot 1...
      // Since Pot X has K teams owned by K different players, they play a round-robin stage.
      for (let g = 0; g < N; g++) {
        const groupLetter = String.fromCharCode(65 + g); // Group A, Group B...
        const groupTeams = assignments.filter(a => a.potIndex === g);
        
        // Single round-robin pairings for any K teams: u plays v for all u < v
        for (let u = 0; u < numPlayers; u++) {
          for (let v = u + 1; v < numPlayers; v++) {
            const team1 = groupTeams[u];
            const team2 = groupTeams[v];

            const insertMatchRes = await client.query(`
              INSERT INTO matches (tournament_id, stage, team1_id, team2_id, current_player1_id, current_player2_id, status)
              VALUES ($1, $2, $3, $4, $5, $6, 'pending')
              RETURNING *;
            `, [
              tournamentId,
              `Group ${groupLetter}`,
              team1.teamId,
              team2.teamId,
              team1.playerId,
              team2.playerId
            ]);
            matchesScheduled.push(insertMatchRes.rows[0]);
          }
        }
      }
    } else {
      // Sort teamsWithOwners matching the overall ranking (descending)
      const teamsWithOwners = teams.map(t => {
        const assign = assignments.find(a => a.teamId === t.id);
        return {
          id: t.id,
          name: t.name,
          overall: t.overall,
          owner_id: assign.playerId
        };
      }).sort((a, b) => b.overall - a.overall);

      const X = teamsWithOwners.length;
      const isPowerOfTwo = (X & (X - 1)) === 0;

      function getStageName(teamsCount) {
        if (teamsCount === 2) return 'Фінал';
        if (teamsCount === 4) return '1/2 фіналу';
        if (teamsCount === 8) return '1/4 фіналу';
        if (teamsCount === 16) return '1/8 фіналу';
        if (teamsCount === 32) return '1/16 фіналу';
        return `Раунд ${teamsCount}`;
      }

      let playoffMatches = [];

      if (isPowerOfTwo) {
        const paired = new Set();
        for (let i = 0; i < X; i++) {
          if (paired.has(i)) continue;

          let opponentIndex = -1;
          for (let j = X - 1; j > i; j--) {
            if (paired.has(j)) continue;
            if (teamsWithOwners[i].owner_id !== teamsWithOwners[j].owner_id) {
              opponentIndex = j;
              break;
            }
          }

          if (opponentIndex === -1) {
            for (let j = i + 1; j < X; j++) {
              if (!paired.has(j)) {
                opponentIndex = j;
                break;
              }
            }
          }

          if (opponentIndex !== -1) {
            paired.add(i);
            paired.add(opponentIndex);
            playoffMatches.push({
              team1: teamsWithOwners[i],
              team2: teamsWithOwners[opponentIndex],
              stage: getStageName(X)
            });
          }
        }
      } else {
        // Find largest power of 2 smaller than X
        let P = 2;
        while (P * 2 < X) {
          P *= 2;
        }

        const M = X - P; // Number of Preliminary Matches
        const numPlaying = 2 * M;
        const numByes = X - numPlaying; // Top teams receiving byes

        const preliminaryTeams = teamsWithOwners.slice(numByes);

        const paired = new Set();
        const len = preliminaryTeams.length;
        for (let i = 0; i < len; i++) {
          if (paired.has(i)) continue;

          let opponentIndex = -1;
          for (let j = len - 1; j > i; j--) {
            if (paired.has(j)) continue;
            if (preliminaryTeams[i].owner_id !== preliminaryTeams[j].owner_id) {
              opponentIndex = j;
              break;
            }
          }

          if (opponentIndex === -1) {
            for (let j = i + 1; j < len; j++) {
              if (!paired.has(j)) {
                opponentIndex = j;
                break;
              }
            }
          }

          if (opponentIndex !== -1) {
            paired.add(i);
            paired.add(opponentIndex);
            playoffMatches.push({
              team1: preliminaryTeams[i],
              team2: preliminaryTeams[opponentIndex],
              stage: 'Попередній раунд'
            });
          }
        }
      }

      // Save Playoff matches
      for (const match of playoffMatches) {
        const insertMatchRes = await client.query(`
          INSERT INTO matches (tournament_id, stage, team1_id, team2_id, current_player1_id, current_player2_id, status)
          VALUES ($1, $2, $3, $4, $5, $6, 'pending')
          RETURNING *;
        `, [
          tournamentId,
          match.stage,
          match.team1.id,
          match.team2.id,
          match.team1.owner_id,
          match.team2.owner_id
        ]);
        matchesScheduled.push(insertMatchRes.rows[0]);
      }
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Tournament generated successfully',
      tournamentId,
      assignments: assignments.map(a => ({
        teamId: a.teamId,
        teamName: teams.find(t => t.id === a.teamId).name,
        playerId: a.playerId,
        playerName: playerNames[playerIds.indexOf(a.playerId)],
        potIndex: a.potIndex
      })),
      matchesCount: matchesScheduled.length
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error generating tournament:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  } finally {
    client.release();
  }
});


// DELETE /api/tournaments/:id - Delete a tournament and cascade delete all its matches
app.delete('/api/tournaments/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const deleteRes = await pool.query('DELETE FROM tournaments WHERE id = $1 RETURNING id;', [id]);
    if (deleteRes.rowCount === 0) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    res.json({ message: 'Tournament deleted successfully', tournamentId: id });
  } catch (error) {
    console.error('Error deleting tournament:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// =========================================================================
// 3. SUBMIT MATCH SCORE & REWARD COINS
// =========================================================================

// PUT /api/matches/:id - Submit score, record goals, and award coins
app.put('/api/matches/:id', async (req, res) => {
  const { id } = req.params;
  const { score1, score2, status, goals, player1_advanced, player2_advanced } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch match details
    const matchRes = await client.query('SELECT * FROM matches WHERE id = $1;', [id]);
    if (matchRes.rowCount === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }
    const match = matchRes.rows[0];

    // Determine target status
    const targetStatus = status || 'completed';

    if (targetStatus === 'live') {
      // Just start the match
      await client.query(`
        UPDATE matches
        SET score1 = NULL, score2 = NULL, status = 'live'
        WHERE id = $1;
      `, [id]);

      await client.query('COMMIT');
      return res.json({ message: 'Match started (Live)', matchId: id });
    }

    // Otherwise, we are completing the match
    if (score1 === undefined || score1 === null || isNaN(parseInt(score1)) ||
        score2 === undefined || score2 === null || isNaN(parseInt(score2))) {
      return res.status(400).json({ error: 'Valid score1 and score2 are required to complete a match' });
    }

    const s1 = parseInt(score1);
    const s2 = parseInt(score2);

    // 2. Fetch human player names
    const p1Res = await client.query('SELECT name FROM players WHERE id = $1;', [match.current_player1_id]);
    const p2Res = await client.query('SELECT name FROM players WHERE id = $1;', [match.current_player2_id]);
    const player1Name = p1Res.rows[0].name;
    const player2Name = p2Res.rows[0].name;

    // 3. Revert coins if match was already completed
    if (match.status === 'completed') {
      const oldScore1 = match.score1;
      const oldScore2 = match.score2;
      let p1OldRefund = 0;
      let p2OldRefund = 0;

      // Old win/draw
      if (oldScore1 > oldScore2) {
        p1OldRefund += 60;
      } else if (oldScore2 > oldScore1) {
        p2OldRefund += 60;
      } else {
        p1OldRefund += 20;
        p2OldRefund += 20;
      }

      // Old clean sheets
      if (oldScore2 === 0) p1OldRefund += 10;
      if (oldScore1 === 0) p2OldRefund += 10;

      await client.query('UPDATE players_balance SET coins_balance = coins_balance - $1 WHERE player_name = $2;', [p1OldRefund, player1Name]);
      await client.query('UPDATE players_balance SET coins_balance = coins_balance - $1 WHERE player_name = $2;', [p2OldRefund, player2Name]);
    }

    // 4. Update match score and status
    await client.query(`
      UPDATE matches
      SET score1 = $1, score2 = $2, status = 'completed'
      WHERE id = $3;
    `, [s1, s2, id]);

    // 5. Clear and record goals
    await client.query('DELETE FROM goals WHERE match_id = $1;', [id]);
    if (Array.isArray(goals) && goals.length > 0) {
      const insertGoalQuery = `
        INSERT INTO goals (match_id, team_id, scorer_id, assistant_id, minute)
        VALUES ($1, $2, $3, $4, $5);
      `;
      for (const g of goals) {
        await client.query(insertGoalQuery, [
          id,
          g.team_id,
          g.scorer_id,
          g.assistant_id || null,
          parseInt(g.minute) || null
        ]);
      }
    }

    // 6. Calculate new rewards
    let p1Reward = 0;
    let p2Reward = 0;

    // Match outcome
    if (s1 > s2) {
      p1Reward += 60;
    } else if (s2 > s1) {
      p2Reward += 60;
    } else {
      p1Reward += 20;
      p2Reward += 20;
    }

    // Clean sheet (+10 coins if conceded 0)
    if (s2 === 0) p1Reward += 10;
    if (s1 === 0) p2Reward += 10;

    // Playoff qualification (+50 coins)
    if (player1_advanced === true) p1Reward += 50;
    if (player2_advanced === true) p2Reward += 50;

    // Update balances
    await client.query('UPDATE players_balance SET coins_balance = coins_balance + $1 WHERE player_name = $2;', [p1Reward, player1Name]);
    await client.query('UPDATE players_balance SET coins_balance = coins_balance + $1 WHERE player_name = $2;', [p2Reward, player2Name]);

    // 6b. Auto-advance playoff winners
    if (match.status !== 'completed' && match.stage && !match.stage.startsWith('Group')) {
      const unfinishedRes = await client.query(
        'SELECT COUNT(*) FROM matches WHERE tournament_id = $1 AND stage = $2 AND status != \'completed\';',
        [match.tournament_id, match.stage]
      );
      const unfinishedCount = parseInt(unfinishedRes.rows[0].count);

      if (unfinishedCount === 0) {
        // Current stage finished! Get all active (uneliminated) teams in this tournament
        const activeTeamsRes = await client.query(`
          SELECT tt.team_id, t.name as team_name, t.overall, tt.original_player_id as owner_id
          FROM tournament_teams tt
          JOIN teams t ON tt.team_id = t.id
          WHERE tt.tournament_id = $1
            AND tt.team_id NOT IN (
              SELECT CASE WHEN score1 > score2 THEN team2_id ELSE team1_id END
              FROM matches
              WHERE tournament_id = $1 AND status = 'completed' AND stage NOT LIKE 'Group%'
            );
        `, [match.tournament_id]);

        const activeTeams = activeTeamsRes.rows.sort((a, b) => b.overall - a.overall);
        const Y = activeTeams.length;

        if (Y > 1) {
          let nextStageName = `Раунд ${Y}`;
          if (Y === 2) nextStageName = 'Фінал';
          else if (Y === 4) nextStageName = '1/2 фіналу';
          else if (Y === 8) nextStageName = '1/4 фіналу';
          else if (Y === 16) nextStageName = '1/8 фіналу';
          else if (Y === 32) nextStageName = '1/16 фіналу';

          const paired = new Set();
          const playoffMatches = [];
          for (let i = 0; i < Y; i++) {
            if (paired.has(i)) continue;

            let opponentIndex = -1;
            for (let j = Y - 1; j > i; j--) {
              if (paired.has(j)) continue;
              if (activeTeams[i].owner_id !== activeTeams[j].owner_id) {
                opponentIndex = j;
                break;
              }
            }

            if (opponentIndex === -1) {
              for (let j = i + 1; j < Y; j++) {
                if (!paired.has(j)) {
                  opponentIndex = j;
                  break;
                }
              }
            }

            if (opponentIndex !== -1) {
              paired.add(i);
              paired.add(opponentIndex);
              playoffMatches.push({
                team1: activeTeams[i],
                team2: activeTeams[opponentIndex]
              });
            }
          }

          // Save matches for next stage
          for (const pair of playoffMatches) {
            await client.query(`
              INSERT INTO matches (tournament_id, stage, team1_id, team2_id, current_player1_id, current_player2_id, status)
              VALUES ($1, $2, $3, $4, $5, $6, 'pending');
            `, [
              match.tournament_id,
              nextStageName,
              pair.team1.team_id,
              pair.team2.team_id,
              pair.team1.owner_id,
              pair.team2.owner_id
            ]);
          }
        }
      }
    }

    await client.query('COMMIT');

    res.json({
      message: 'Match results submitted successfully',
      score: { team1: s1, team2: s2 },
      rewards: {
        [player1Name]: { coinsAdded: p1Reward },
        [player2Name]: { coinsAdded: p2Reward }
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error submitting match score:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    client.release();
  }
});


// =========================================================================
// 4. PLAYOFF SQUAD TRANSFER
// =========================================================================

// POST /api/matches/:id/transfer - Reassign a team owner for a match (playoff conflict workaround)
app.post('/api/matches/:id/transfer', async (req, res) => {
  const { id } = req.params;
  const { team_id, new_player_id } = req.body;

  if (!team_id || !new_player_id) {
    return res.status(400).json({ error: 'team_id and new_player_id are required' });
  }

  try {
    const matchRes = await pool.query('SELECT * FROM matches WHERE id = $1;', [id]);
    if (matchRes.rowCount === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }
    const match = matchRes.rows[0];

    // Check if team belongs to match
    let fieldToUpdate = '';
    if (match.team1_id === parseInt(team_id)) {
      fieldToUpdate = 'current_player1_id';
    } else if (match.team2_id === parseInt(team_id)) {
      fieldToUpdate = 'current_player2_id';
    } else {
      return res.status(400).json({ error: 'Team does not participate in this match' });
    }

    // Verify new player exists
    const playerCheck = await pool.query('SELECT id FROM players WHERE id = $1;', [new_player_id]);
    if (playerCheck.rowCount === 0) {
      return res.status(404).json({ error: 'New player not found' });
    }

    // Update current player
    const updateQuery = `UPDATE matches SET ${fieldToUpdate} = $1 WHERE id = $2 RETURNING *;`;
    const updatedMatch = await pool.query(updateQuery, [new_player_id, id]);

    res.json({
      message: 'Control of team transferred successfully for this match',
      match: updatedMatch.rows[0]
    });
  } catch (error) {
    console.error('Error in POST /api/matches/:id/transfer:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// =========================================================================
// 5. TOURNAMENT STATS & STANDINGS
// =========================================================================

// GET /api/stats - Standings, top scorers, assistants, and coin balance leaderboard
app.get('/api/stats', async (req, res) => {
  let { tournament_id } = req.query;

  try {
    // Determine tournament_id if not specified
    if (!tournament_id) {
      const latestTourney = await pool.query('SELECT id FROM tournaments ORDER BY date DESC, id DESC LIMIT 1;');
      if (latestTourney.rowCount === 0) {
        return res.json({
          groupStandings: {},
          playoffMatches: [],
          topScorers: [],
          topAssistants: [],
          coinsLeaderboard: []
        });
      }
      tournament_id = latestTourney.rows[0].id;
    }

    // 1. Fetch Tournament Teams details
    const ttRes = await pool.query(`
      SELECT tt.team_id, t.name as team_name, t.flag_code, p.name as player_name
      FROM tournament_teams tt
      JOIN teams t ON tt.team_id = t.id
      JOIN players p ON tt.original_player_id = p.id
      WHERE tt.tournament_id = $1;
    `, [tournament_id]);
    const tournamentTeams = ttRes.rows;

    // 2. Fetch Group stage matches (all statuses)
    const mRes = await pool.query(`
      SELECT id, stage, team1_id, team2_id, score1, score2, status
      FROM matches
      WHERE tournament_id = $1 AND stage LIKE 'Group%';
    `, [tournament_id]);
    const groupMatches = mRes.rows;

    // Build map for quick team details lookup
    const teamMap = {};
    tournamentTeams.forEach(t => {
      teamMap[t.team_id] = {
        id: t.team_id,
        name: t.team_name,
        flag_code: t.flag_code,
        player_name: t.player_name,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        points: 0
      };
    });

    // Populate Group Standings
    const groups = {};
    groupMatches.forEach(m => {
      const groupName = m.stage;
      if (!groups[groupName]) {
        groups[groupName] = {};
      }
      if (teamMap[m.team1_id] && !groups[groupName][m.team1_id]) {
        groups[groupName][m.team1_id] = JSON.parse(JSON.stringify(teamMap[m.team1_id]));
      }
      if (teamMap[m.team2_id] && !groups[groupName][m.team2_id]) {
        groups[groupName][m.team2_id] = JSON.parse(JSON.stringify(teamMap[m.team2_id]));
      }

      if (m.status === 'completed') {
        const t1 = groups[groupName][m.team1_id];
        const t2 = groups[groupName][m.team2_id];

        if (t1 && t2) {
          t1.played += 1;
          t2.played += 1;
          t1.gf += m.score1;
          t1.ga += m.score2;
          t2.gf += m.score2;
          t2.ga += m.score1;
          t1.gd = t1.gf - t1.ga;
          t2.gd = t2.gf - t2.ga;

          if (m.score1 > m.score2) {
            t1.wins += 1;
            t1.points += 3;
            t2.losses += 1;
          } else if (m.score2 > m.score1) {
            t2.wins += 1;
            t2.points += 3;
            t1.losses += 1;
          } else {
            t1.draws += 1;
            t1.points += 1;
            t2.draws += 1;
            t2.points += 1;
          }
        }
      }
    });

    // Sort group tables
    const groupStandings = {};
    for (const [groupName, groupTeamsMap] of Object.entries(groups)) {
      const sortedTeams = Object.values(groupTeamsMap).sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.gd !== a.gd) return b.gd - a.gd;
        return b.gf - a.gf;
      });
      groupStandings[groupName] = sortedTeams;
    }

    // 3. Playoff matches
    const playoffRes = await pool.query(`
      SELECT 
        m.id, 
        m.stage, 
        m.score1, 
        m.score2, 
        m.status,
        t1.name as team1_name,
        t2.name as team2_name,
        t1.flag_code as team1_flag_code,
        t2.flag_code as team2_flag_code,
        p1.name as player1_name,
        p2.name as player2_name
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      JOIN players p1 ON m.current_player1_id = p1.id
      JOIN players p2 ON m.current_player2_id = p2.id
      WHERE m.tournament_id = $1 AND m.stage NOT LIKE 'Group%' AND m.stage NOT LIKE 'Група%'
      ORDER BY m.id ASC;
    `, [tournament_id]);

    // 4. Golden Boot (Top 10 Scorers)
    const scorersRes = await pool.query(`
      SELECT 
        tp.id as player_id, 
        tp.name as player_name, 
        t.name as team_name, 
        t.flag_code,
        p.name as owner_player_name,
        COUNT(g.id) as goals_count
      FROM goals g
      JOIN team_players tp ON g.scorer_id = tp.id
      JOIN teams t ON g.team_id = t.id
      JOIN matches m ON g.match_id = m.id
      LEFT JOIN tournament_teams tt ON tt.tournament_id = m.tournament_id AND tt.team_id = t.id
      LEFT JOIN players p ON tt.original_player_id = p.id
      WHERE m.tournament_id = $1
      GROUP BY tp.id, tp.name, t.name, t.flag_code, p.name
      ORDER BY goals_count DESC, tp.name ASC
      LIMIT 10;
    `, [tournament_id]);

    // 5. Playmaker Award (Top 10 Assistants)
    const assistantsRes = await pool.query(`
      SELECT 
        tp.id as player_id, 
        tp.name as player_name, 
        t.name as team_name, 
        t.flag_code,
        p.name as owner_player_name,
        COUNT(g.id) as assists_count
      FROM goals g
      JOIN team_players tp ON g.assistant_id = tp.id
      JOIN teams t ON g.team_id = t.id
      JOIN matches m ON g.match_id = m.id
      LEFT JOIN tournament_teams tt ON tt.tournament_id = m.tournament_id AND tt.team_id = t.id
      LEFT JOIN players p ON tt.original_player_id = p.id
      WHERE m.tournament_id = $1
      GROUP BY tp.id, tp.name, t.name, t.flag_code, p.name
      ORDER BY assists_count DESC, tp.name ASC
      LIMIT 10;
    `, [tournament_id]);

    // 6. Coins Leaderboard
    const coinsRes = await pool.query('SELECT player_name, coins_balance FROM players_balance ORDER BY coins_balance DESC, player_name ASC;');

    res.json({
      tournamentId: parseInt(tournament_id),
      groupStandings,
      playoffMatches: playoffRes.rows,
      topScorers: scorersRes.rows,
      topAssistants: assistantsRes.rows,
      coinsLeaderboard: coinsRes.rows
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/tournaments - Fetch list of all tournaments
app.get('/api/tournaments', async (req, res) => {
  try {
    const query = 'SELECT * FROM tournaments ORDER BY date DESC, id DESC;';
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching tournaments:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/players - Fetch list of all players & balances
app.get('/api/players', async (req, res) => {
  try {
    const query = `
      SELECT p.id, p.name, COALESCE(pb.coins_balance, 0) as coins_balance, p.created_at
      FROM players p
      LEFT JOIN players_balance pb ON p.name = pb.player_name
      ORDER BY p.name ASC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching players:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/players - Register new human player
app.post('/api/players', async (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Player name is required' });
  }

  try {
    const query = 'INSERT INTO players (name) VALUES ($1) RETURNING *;';
    const result = await pool.query(query, [name.trim()]);
    
    const balanceQuery = 'SELECT coins_balance FROM players_balance WHERE player_name = $1;';
    const balanceResult = await pool.query(balanceQuery, [result.rows[0].name]);
    
    res.status(201).json({
      ...result.rows[0],
      coins_balance: balanceResult.rows[0] ? balanceResult.rows[0].coins_balance : 0
    });
  } catch (error) {
    console.error('Error creating player:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Player with this name already exists' });
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// DELETE /api/players/:id - Delete a human player and cascade delete all their matches & assignments
app.delete('/api/players/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const deleteRes = await pool.query('DELETE FROM players WHERE id = $1 RETURNING id, name;', [id]);
    if (deleteRes.rowCount === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    res.json({ message: 'Player deleted successfully', playerId: id, playerName: deleteRes.rows[0].name });
  } catch (error) {
    console.error('Error deleting player:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});


// GET /api/matches - Fetch list of all matches
app.get('/api/matches', async (req, res) => {
  try {
    const query = `
      SELECT 
        m.id, 
        m.stage, 
        m.score1, 
        m.score2, 
        m.status,
        m.tournament_id,
        m.team1_id,
        m.team2_id,
        m.current_player1_id,
        m.current_player2_id,
        t1.name as team1_name,
        t2.name as team2_name,
        t1.flag_code as team1_flag_code,
        t2.flag_code as team2_flag_code,
        p1.name as player1_name,
        p2.name as player2_name,
        m.created_at
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      JOIN players p1 ON m.current_player1_id = p1.id
      JOIN players p2 ON m.current_player2_id = p2.id
      ORDER BY m.id DESC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching matches:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// =========================================================================
// Global Error Handler
// =========================================================================
app.use((err, req, res, next) => {
  console.error('[App Error]', err.stack);
  res.status(500).json({ error: err.message || 'Something broke!' });
});

// Start Server
app.listen(PORT, () => {
  console.log(`[Express] Server is running on port ${PORT}`);
});
