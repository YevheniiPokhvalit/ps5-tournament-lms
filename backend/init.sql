-- Database Initialization Script for Cyberfootball Tournament

-- 1. Players (Human Franchise Owners)
CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Players Balance (linked to players name)
CREATE TABLE IF NOT EXISTS players_balance (
    player_name VARCHAR(255) PRIMARY KEY REFERENCES players(name) ON DELETE CASCADE,
    coins_balance INT NOT NULL DEFAULT 0
);

-- Trigger to automatically create balance of 0 when a player is added
CREATE OR REPLACE FUNCTION create_player_balance()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO players_balance (player_name, coins_balance)
    VALUES (NEW.name, 0)
    ON CONFLICT (player_name) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_create_player_balance
AFTER INSERT ON players
FOR EACH ROW
EXECUTE FUNCTION create_player_balance();

-- 3. Teams (id, name, league, attack, midfield, defense, overall, flag_code)
CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    league VARCHAR(255) NOT NULL,
    attack INT NOT NULL CHECK (attack BETWEEN 0 AND 100),
    midfield INT NOT NULL CHECK (midfield BETWEEN 0 AND 100),
    defense INT NOT NULL CHECK (defense BETWEEN 0 AND 100),
    overall INT NOT NULL CHECK (overall BETWEEN 0 AND 100),
    flag_code VARCHAR(10) DEFAULT NULL
);

-- 4. Team Players (real footballers for the match logs)
CREATE TABLE IF NOT EXISTS team_players (
    id SERIAL PRIMARY KEY,
    team_id INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    UNIQUE (team_id, name)
);

-- 5. Tournaments
CREATE TABLE IF NOT EXISTS tournaments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('Groups+Playoff', 'Playoff'))
);

-- 6. Tournament Teams (associates teams to a tournament and maps them to a human player)
CREATE TABLE IF NOT EXISTS tournament_teams (
    tournament_id INT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    team_id INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    original_player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    PRIMARY KEY (tournament_id, team_id)
);

-- 7. Matches
CREATE TABLE IF NOT EXISTS matches (
    id SERIAL PRIMARY KEY,
    tournament_id INT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    stage VARCHAR(100) NOT NULL, -- e.g. 'Group Stage', 'Semi-final', 'Final'
    team1_id INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    team2_id INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    current_player1_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    current_player2_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    score1 INT DEFAULT NULL,
    score2 INT DEFAULT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'live', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_scores CHECK (
        (status = 'pending' AND score1 IS NULL AND score2 IS NULL) OR
        (status = 'live') OR
        (status = 'completed' AND score1 IS NOT NULL AND score2 IS NOT NULL)
    )
);

-- 8. Goals
CREATE TABLE IF NOT EXISTS goals (
    id SERIAL PRIMARY KEY,
    match_id INT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    team_id INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    scorer_id INT NOT NULL REFERENCES team_players(id) ON DELETE CASCADE,
    assistant_id INT REFERENCES team_players(id) ON DELETE SET NULL,
    minute INT CHECK (minute BETWEEN 0 AND 120),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================================
-- Seed Initial Data
-- =========================================================================

-- Seed 4 human players
INSERT INTO players (name) VALUES 
('Alex'),
('Max'),
('Dmytro'),
('Yaroslav')
ON CONFLICT (name) DO NOTHING;

-- Update initial balances (since trigger automatically created them with 0)
UPDATE players_balance SET coins_balance = 1000 WHERE player_name = 'Alex';
UPDATE players_balance SET coins_balance = 1200 WHERE player_name = 'Max';
UPDATE players_balance SET coins_balance = 850 WHERE player_name = 'Dmytro';
UPDATE players_balance SET coins_balance = 1500 WHERE player_name = 'Yaroslav';

-- Seed Teams
INSERT INTO teams (name, league, attack, midfield, defense, overall) VALUES
('Real Madrid', 'La Liga', 90, 88, 86, 88),
('Manchester City', 'Premier League', 89, 91, 85, 88),
('Arsenal', 'Premier League', 86, 87, 85, 86),
('Liverpool', 'Premier League', 85, 84, 85, 85),
('Bayern Munich', 'Bundesliga', 86, 85, 84, 85),
('Barcelona', 'La Liga', 84, 86, 82, 84),
('PSG', 'Ligue 1', 87, 82, 83, 84),
('Inter Milan', 'Serie A', 83, 85, 85, 84)
ON CONFLICT (name) DO NOTHING;

-- Seed Real Players (Squad Roster)
-- Real Madrid (id = 1)
INSERT INTO team_players (team_id, name) VALUES
(1, 'Kylian Mbappe'),
(1, 'Vinicius Junior'),
(1, 'Jude Bellingham'),
(1, 'Federico Valverde')
ON CONFLICT DO NOTHING;

-- Manchester City (id = 2)
INSERT INTO team_players (team_id, name) VALUES
(2, 'Erling Haaland'),
(2, 'Kevin De Bruyne'),
(2, 'Rodri'),
(2, 'Phil Foden')
ON CONFLICT DO NOTHING;

-- Arsenal (id = 3)
INSERT INTO team_players (team_id, name) VALUES
(3, 'Bukayo Saka'),
(3, 'Martin Odegaard'),
(3, 'Declan Rice'),
(3, 'William Saliba')
ON CONFLICT DO NOTHING;

-- Liverpool (id = 4)
INSERT INTO team_players (team_id, name) VALUES
(4, 'Mohamed Salah'),
(4, 'Luis Diaz'),
(4, 'Alexis Mac Allister'),
(4, 'Virgil van Dijk')
ON CONFLICT DO NOTHING;

-- Seed a Mock Tournament
INSERT INTO tournaments (name, type) VALUES
('Summer Franchise League 2026', 'Groups+Playoff')
ON CONFLICT DO NOTHING;

-- Associate Teams to the Tournament
-- Assign 2 teams to each of the 4 players (total 8 teams)
-- Alex (id 1): Real Madrid (id 1), Barcelona (id 6)
-- Max (id 2): Manchester City (id 2), PSG (id 7)
-- Dmytro (id 3): Arsenal (id 3), Inter Milan (id 8)
-- Yaroslav (id 4): Liverpool (id 4), Bayern Munich (id 5)
INSERT INTO tournament_teams (tournament_id, team_id, original_player_id) VALUES
(1, 1, 1),
(1, 6, 1),
(1, 2, 2),
(1, 7, 2),
(1, 3, 3),
(1, 8, 3),
(1, 4, 4),
(1, 5, 4)
ON CONFLICT DO NOTHING;

-- Seed a sample match
INSERT INTO matches (tournament_id, stage, team1_id, team2_id, current_player1_id, current_player2_id, score1, score2, status) VALUES
(1, 'Group Stage - Round 1', 1, 2, 1, 2, 3, 2, 'completed')
ON CONFLICT DO NOTHING;

-- Seed goals for the sample match (Real Madrid 3 - 2 Manchester City)
-- Real Madrid scorers: Mbappe (2 goals), Vinicius Jr (1 goal)
-- Man City scorers: Haaland (2 goals)
INSERT INTO goals (match_id, team_id, scorer_id, assistant_id, minute) VALUES
(1, 1, 1, 3, 12),  -- Mbappe (scorer_id=1, Mbappe), assistant_id=3 (Bellingham)
(1, 2, 5, 6, 28),  -- Haaland (scorer_id=5, Haaland), assistant_id=6 (De Bruyne)
(1, 1, 2, NULL, 40),-- Vinicius (scorer_id=2, Vinicius)
(1, 2, 5, NULL, 65),-- Haaland (scorer_id=5)
(1, 1, 1, 2, 88)   -- Mbappe (scorer_id=1), assistant_id=2 (Vinicius)
ON CONFLICT DO NOTHING;
