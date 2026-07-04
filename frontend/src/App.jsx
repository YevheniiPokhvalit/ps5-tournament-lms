import React, { useState, useEffect, useRef } from 'react';
import { 
  Gamepad2, 
  Trophy, 
  Settings, 
  Image as ImageIcon, 
  Plus, 
  Trash2, 
  Edit3, 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  Download, 
  Users, 
  RefreshCw,
  Coins
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5050';

// Global fetch wrapper to bypass ngrok browser warnings
const originalFetch = window.fetch;
window.fetch = function (url, options = {}) {
  if (typeof url === 'string' && url.startsWith(API_URL)) {
    const headers = options.headers ? { ...options.headers } : {};
    headers['ngrok-skip-browser-warning'] = 'true';
    options.headers = headers;
  }
  return originalFetch(url, options);
};

function App() {
  const [activeTab, setActiveTab] = useState('match-center');
  const [selectedTournamentId, setSelectedTournamentId] = useState(null);
  const [showCreateTournamentModal, setShowCreateTournamentModal] = useState(false);
  const [resolverTournamentId, setResolverTournamentId] = useState('');
  
  // Routing & Role states
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [isAdminRoute, setIsAdminRoute] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(localStorage.getItem('isAdminAuthenticated') === 'true');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [selectedPlayerName, setSelectedPlayerName] = useState(localStorage.getItem('selectedPlayerName') || '');

  const navigateTo = (path) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    if (path === '/') {
      window.location.hash = '';
    }
  };

  const renderTeamFlag = (flagCode, size = "w-4 h-4") => {
    if (flagCode && flagCode.trim() !== '') {
      return (
        <img
          src={`https://flagcdn.com/w40/${flagCode.toLowerCase()}.png`}
          alt="flag"
          className={`${size} rounded-full object-cover shrink-0 border border-ps-dark-item/50`}
        />
      );
    }
    return <span className="text-[10px] shrink-0">⚽</span>;
  };

  const handleAdminLogout = () => {
    setIsAdminAuthenticated(false);
    localStorage.removeItem('isAdminAuthenticated');
    triggerSuccess('Ви вийшли з адмін-панелі');
    navigateTo('/');
  };

  const getSelectedPlayerTeams = () => {
    if (!selectedPlayerName || !selectedTournamentId) return [];
    const tMatches = matches.filter(m => m.tournament_id === selectedTournamentId);
    const myTeams = new Set();
    tMatches.forEach(m => {
      if (m.player1_name === selectedPlayerName) myTeams.add(m.team1_name);
      if (m.player2_name === selectedPlayerName) myTeams.add(m.team2_name);
    });
    return Array.from(myTeams);
  };

  // Sync activeTab with path
  useEffect(() => {
    if (isAdminRoute) {
      setActiveTab('admin');
    } else {
      setActiveTab('match-center');
    }
  }, [isAdminRoute]);

  // Sync popstate / hash location
  useEffect(() => {
    const checkIsAdminRoute = () => {
      const isPath = window.location.pathname === '/manage-tournament-panel' || 
                     window.location.hash === '#/manage-tournament-panel' || 
                     window.location.hash === '#manage-tournament-panel' ||
                     window.location.search.includes('manage-tournament-panel');
      setIsAdminRoute(isPath);
    };

    checkIsAdminRoute();

    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
      checkIsAdminRoute();
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, [currentPath]);

  // Shared state
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState({}); // Grouped by league
  const [flatTeams, setFlatTeams] = useState([]); // Flat list of teams
  const [tournaments, setTournaments] = useState([]);
  const [matches, setMatches] = useState([]);
  const [stats, setStats] = useState(null);
  
  // Loading & error state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Form states
  // 1. Create team
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamLeague, setNewTeamLeague] = useState('Premier League');
  const [newTeamAttack, setNewTeamAttack] = useState(80);
  const [newTeamMidfield, setNewTeamMidfield] = useState(80);
  const [newTeamDefense, setNewTeamDefense] = useState(80);
  const [newTeamOverall, setNewTeamOverall] = useState(80);
  const [newTeamRoster, setNewTeamRoster] = useState('');
  const [newTeamFlagCode, setNewTeamFlagCode] = useState('');

  // 2. Edit team players
  const [selectedTeamForPlayers, setSelectedTeamForPlayers] = useState('');
  const [teamPlayersList, setTeamPlayersList] = useState([]);
  const [newPlayerRosterName, setNewPlayerRosterName] = useState('');
  const [newPlayerName, setNewPlayerName] = useState('');
  const [activePlayoffStageTab, setActivePlayoffStageTab] = useState('');

  // 3. Tournament constructor
  const [tournamentName, setTournamentName] = useState('');
  const [tourneyPlayers, setTourneyPlayers] = useState(['Alex', 'Max', 'Dmytro', 'Yaroslav']);
  const [tourneyN, setTourneyN] = useState(1);
  const [tourneyType, setTourneyType] = useState('Groups+Playoff');
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [selectedLeagueTab, setSelectedLeagueTab] = useState('');

  // 4. Close match modal/form
  const [activeClosingMatch, setActiveClosingMatch] = useState(null);
  const [score1, setScore1] = useState(0);
  const [score2, setScore2] = useState(0);
  const [matchGoals, setMatchGoals] = useState([]); // [{ team_id, scorer_id, assistant_id, minute }]
  const [player1Advanced, setPlayer1Advanced] = useState(false);
  const [player2Advanced, setPlayer2Advanced] = useState(false);
  const [competingPlayers, setCompetingPlayers] = useState({ team1: [], team2: [] });

  // 5. Transfer playoff team
  const [transferMatchId, setTransferMatchId] = useState('');
  const [transferTeamId, setTransferTeamId] = useState('');
  const [transferNewPlayerId, setTransferNewPlayerId] = useState('');

  // 6. Canvas banner generator
  const canvasRef = useRef(null);
  const [bannerMatchId, setBannerMatchId] = useState('');
  const [bannerTeam1, setBannerTeam1] = useState('Team A');
  const [bannerTeam2, setBannerTeam2] = useState('Team B');
  const [bannerPlayer1, setBannerPlayer1] = useState('Player 1');
  const [bannerPlayer2, setBannerPlayer2] = useState('Player 2');

  // Fetch initial data
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const playersRes = await fetch(`${API_URL}/api/players`);
      const playersData = await playersRes.json();
      setPlayers(playersData);

      const teamsRes = await fetch(`${API_URL}/api/teams`);
      const teamsData = await teamsRes.json();
      setTeams(teamsData);

      const flat = [];
      Object.keys(teamsData).forEach(league => {
        flat.push(...teamsData[league]);
      });
      setFlatTeams(flat);
      if (flat.length > 0 && !selectedTeamForPlayers) {
        setSelectedTeamForPlayers(flat[0].id.toString());
      }
      
      const leagues = Object.keys(teamsData);
      if (leagues.length > 0 && !selectedLeagueTab) {
        setSelectedLeagueTab(leagues[0]);
      }

      const tournamentsRes = await fetch(`${API_URL}/api/tournaments`);
      const tournamentsData = await tournamentsRes.json();
      setTournaments(tournamentsData);

      const matchesRes = await fetch(`${API_URL}/api/matches`);
      const matchesData = await matchesRes.json();
      setMatches(matchesData);

      const statsRes = await fetch(selectedTournamentId ? `${API_URL}/api/stats?tournament_id=${selectedTournamentId}` : `${API_URL}/api/stats`);
      const statsData = await statsRes.json();
      setStats(statsData);

    } catch (err) {
      console.error(err);
      setError('Помилка завантаження даних із сервера. Перевірте, чи працює бекенд.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedTournamentId) {
      setLoading(true);
      fetch(`${API_URL}/api/stats?tournament_id=${selectedTournamentId}`)
        .then(res => res.json())
        .then(data => setStats(data))
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [selectedTournamentId]);

  useEffect(() => {
    if (selectedTeamForPlayers) {
      fetch(`${API_URL}/api/teams/${selectedTeamForPlayers}/players`)
        .then(res => res.json())
        .then(data => setTeamPlayersList(data))
        .catch(err => console.error(err));
    }
  }, [selectedTeamForPlayers]);

  useEffect(() => {
    if (activeTab === 'banner-gen') {
      drawBanner();
    }
  }, [bannerTeam1, bannerTeam2, bannerPlayer1, bannerPlayer2, activeTab]);

  const triggerSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const triggerError = (msg) => {
    setError(msg);
    setTimeout(() => setError(null), 5000);
  };

  // ACTIONS
  const handleCreateTeam = async (e) => {
    e.preventDefault();
    if (!newTeamName) return triggerError('Введіть назву команди');
    
    setLoading(true);
    try {
      const playersArray = newTeamRoster
        ? newTeamRoster.split(',').map(p => p.trim()).filter(p => p !== '')
        : [];
      
      const res = await fetch(`${API_URL}/api/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTeamName,
          league: newTeamLeague,
          attack: newTeamAttack,
          midfield: newTeamMidfield,
          defense: newTeamDefense,
          overall: newTeamOverall,
          flag_code: newTeamFlagCode,
          players: playersArray
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не вдалося створити команду');
      
      triggerSuccess(`Команду "${data.name}" успішно створено!`);
      setNewTeamName('');
      setNewTeamRoster('');
      setNewTeamFlagCode('');
      fetchData();
    } catch (err) {
      triggerError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPlayerToRoster = async (e) => {
    e.preventDefault();
    if (!newPlayerRosterName || !selectedTeamForPlayers) return;

    try {
      const res = await fetch(`${API_URL}/api/teams/${selectedTeamForPlayers}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPlayerRosterName })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setTeamPlayersList([...teamPlayersList, data]);
      setNewPlayerRosterName('');
      triggerSuccess('Футболіста успішно додано до складу!');
    } catch (err) {
      triggerError(err.message);
    }
  };

  const handleDeletePlayerFromRoster = async (playerId) => {
    try {
      const res = await fetch(`${API_URL}/api/team-players/${playerId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Помилка видалення');
      setTeamPlayersList(teamPlayersList.filter(p => p.id !== playerId));
      triggerSuccess('Футболіста видалено зі складу!');
    } catch (err) {
      triggerError(err.message);
    }
  };

  const handleDeleteTeam = async (teamId) => {
    if (!window.confirm('Ви впевнені, що хочете видалити команду? Склад команди буде видалено каскадно.')) return;
    try {
      const res = await fetch(`${API_URL}/api/teams/${teamId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      triggerSuccess('Команду успішно видалено!');
      fetchData();
    } catch (err) {
      triggerError(err.message);
    }
  };

  const toggleTeamSelection = (teamId) => {
    const limit = tourneyPlayers.length * tourneyN;
    if (selectedTeamIds.includes(teamId)) {
      setSelectedTeamIds(selectedTeamIds.filter(id => id !== teamId));
    } else {
      if (selectedTeamIds.length >= limit) {
        triggerError(`Ви вже вибрали максимум команд (${limit}) для вашої кількості гравців`);
        return;
      }
      setSelectedTeamIds([...selectedTeamIds, teamId]);
    }
  };

  const handleGenerateTournament = async () => {
    const limit = tourneyPlayers.length * tourneyN;
    if (!tournamentName) return triggerError('Введіть назву турніру');
    if (selectedTeamIds.length !== limit) {
      return triggerError(`Будь ласка, оберіть рівно ${limit} команд (вибрано ${selectedTeamIds.length})`);
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/tournaments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tournamentName,
          playerNames: tourneyPlayers,
          type: tourneyType,
          N: tourneyN,
          teamIds: selectedTeamIds
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      triggerSuccess(`Турнір успішно згенеровано! Створено ${data.matchesCount} матчів.`);
      setTournamentName('');
      setSelectedTeamIds([]);
      setActiveTab('match-center');
      fetchData();
    } catch (err) {
      triggerError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTournament = async (tournamentId) => {
    if (!window.confirm('Ви впевнені, що хочете видалити цей турнір? Всі матчі та результати будуть назавжди видалені.')) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/tournaments/${tournamentId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      triggerSuccess('Турнір успішно видалено!');
      if (selectedTournamentId === tournamentId) {
        setSelectedTournamentId(null);
      }
      fetchData();
    } catch (err) {
      triggerError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = (e) => {
    e.preventDefault();
    const expectedPassword = import.meta.env.VITE_ADMIN_PASSWORD || 'admin123';
    if (adminPasswordInput === expectedPassword) {
      setIsAdminAuthenticated(true);
      localStorage.setItem('isAdminAuthenticated', 'true');
      triggerSuccess('Авторизовано успішно!');
      setAdminPasswordInput('');
    } else {
      triggerError('Неправильний пароль адміна!');
    }
  };

  const handleRegisterPlayer = async (e) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return triggerError('Введіть ім\'я гравця');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPlayerName.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      triggerSuccess(`Гравця "${data.name}" успішно створено!`);
      setNewPlayerName('');
      fetchData();
    } catch (err) {
      triggerError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePlayer = async (playerId, playerName) => {
    if (!window.confirm(`Ви дійсно хочете видалити гравця "${playerName}"? Всі його баланси коїнів, закріплені команди та матчі буде видалено назавжди!`)) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/players/${playerId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      triggerSuccess(`Гравця "${playerName}" успішно видалено!`);
      if (selectedPlayerName === playerName) {
        setSelectedPlayerName('');
        localStorage.removeItem('selectedPlayerName');
      }
      fetchData();
    } catch (err) {
      triggerError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openCloseMatchModal = async (match) => {
    setActiveClosingMatch(match);
    setScore1(0);
    setScore2(0);
    setMatchGoals([]);
    setPlayer1Advanced(false);
    setPlayer2Advanced(false);

    try {
      const [squad1Res, squad2Res] = await Promise.all([
        fetch(`${API_URL}/api/teams/${match.team1_id}/players`),
        fetch(`${API_URL}/api/teams/${match.team2_id}/players`)
      ]);
      const squad1 = await squad1Res.json();
      const squad2 = await squad2Res.json();
      setCompetingPlayers({ team1: squad1, team2: squad2 });
    } catch (err) {
      console.error(err);
      triggerError('Не вдалося завантажити склади команд для протоколу.');
    }
  };

  const addGoalRow = (teamId) => {
    setMatchGoals([...matchGoals, { team_id: teamId, scorer_id: '', assistant_id: '', minute: '' }]);
  };

  const updateGoalRow = (index, field, value) => {
    const updated = [...matchGoals];
    updated[index][field] = value ? parseInt(value) : '';
    setMatchGoals(updated);
  };

  const removeGoalRow = (index) => {
    setMatchGoals(matchGoals.filter((_, i) => i !== index));
  };

  const handleSubmitMatchResult = async (e) => {
    e.preventDefault();
    if (!activeClosingMatch) return;

    for (const g of matchGoals) {
      if (!g.scorer_id) {
        return triggerError('Для кожного забитого голу необхідно вказати автора!');
      }
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/matches/${activeClosingMatch.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score1: parseInt(score1),
          score2: parseInt(score2),
          goals: matchGoals,
          player1_advanced: player1Advanced,
          player2_advanced: player2Advanced
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      triggerSuccess('Результат матчу успішно записано! Гравцям нараховано коїни.');
      setActiveClosingMatch(null);
      fetchData();
    } catch (err) {
      triggerError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTransferPlayoffTeam = async (e) => {
    e.preventDefault();
    if (!transferMatchId || !transferTeamId || !transferNewPlayerId) {
      return triggerError('Заповніть усі поля для передачі контролю');
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/matches/${transferMatchId}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: parseInt(transferTeamId),
          new_player_id: parseInt(transferNewPlayerId)
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      triggerSuccess('Керування командою на цей матч успішно передано!');
      setTransferMatchId('');
      setTransferTeamId('');
      setTransferNewPlayerId('');
      fetchData();
    } catch (err) {
      triggerError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const drawBanner = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    canvas.width = 800;
    canvas.height = 450;

    const gradient = ctx.createRadialGradient(400, 225, 50, 400, 225, 450);
    gradient.addColorStop(0, '#131520');
    gradient.addColorStop(1, '#08090e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 450);

    ctx.fillStyle = 'rgba(0, 111, 205, 0.2)';
    ctx.fillRect(0, 0, 10, 450);
    ctx.fillStyle = 'rgba(255, 0, 127, 0.2)';
    ctx.fillRect(790, 0, 10, 450);

    ctx.strokeStyle = 'rgba(0, 240, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let i = 40; i < 800; i += 40) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 450); ctx.stroke();
    }
    for (let i = 40; i < 450; i += 40) {
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(800, i); ctx.stroke();
    }

    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0, 255, 136, 0.1)';
    ctx.beginPath();
    ctx.moveTo(80, 50); ctx.lineTo(120, 110); ctx.lineTo(40, 110);
    ctx.closePath(); ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 0, 127, 0.1)';
    ctx.beginPath();
    ctx.arc(80, 360, 30, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 204, 0, 0.1)';
    ctx.strokeRect(680, 50, 50, 50);

    ctx.strokeStyle = 'rgba(0, 240, 255, 0.1)';
    ctx.beginPath();
    ctx.moveTo(680, 340); ctx.lineTo(730, 390);
    ctx.moveTo(730, 340); ctx.lineTo(680, 390);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = 'bold 13px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PS5 CYBERFOOTBALL CHAMPIONSHIP', 400, 60);

    ctx.fillStyle = 'rgba(18, 20, 31, 0.7)';
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(150, 100, 500, 250, 15);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#00f0ff';
    ctx.font = '800 54px Outfit, sans-serif';
    ctx.shadowColor = 'rgba(0, 240, 255, 0.6)';
    ctx.shadowBlur = 10;
    ctx.fillText('VS', 400, 230);
    ctx.shadowBlur = 0;

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 32px Outfit, sans-serif';
    ctx.fillText(bannerTeam1.toUpperCase(), 340, 210);

    ctx.fillStyle = '#00f0ff';
    ctx.font = '600 18px Outfit, sans-serif';
    ctx.fillText(bannerPlayer1, 340, 245);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 32px Outfit, sans-serif';
    ctx.fillText(bannerTeam2.toUpperCase(), 460, 210);

    ctx.fillStyle = '#ff007f';
    ctx.font = '600 18px Outfit, sans-serif';
    ctx.fillText(bannerPlayer2, 460, 245);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.font = '12px Outfit, sans-serif';
    ctx.fillText('DOWNLOADED FROM PS5 LEAGUE MANAGER', 400, 410);
  };

  const handleSelectBannerMatch = (matchId) => {
    setBannerMatchId(matchId);
    const m = matches.find(x => x.id === parseInt(matchId));
    if (m) {
      setBannerTeam1(m.team1_name);
      setBannerTeam2(m.team2_name);
      setBannerPlayer1(m.player1_name);
      setBannerPlayer2(m.player2_name);
    }
  };

  const downloadBannerImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `match_banner_${bannerPlayer1}_vs_${bannerPlayer2}.png`;
    link.href = url;
    link.click();
  };

  const liveMatch = selectedTournamentId ? matches.find(m => m.tournament_id === selectedTournamentId && m.status === 'live') : null;
  const pendingMatches = selectedTournamentId ? matches.filter(m => m.tournament_id === selectedTournamentId && m.status === 'pending') : [];
  const completedMatches = selectedTournamentId ? matches.filter(m => m.tournament_id === selectedTournamentId && m.status === 'completed') : [];

  const [activeStatsTab, setActiveStatsTab] = useState('tables');

  if (isAdminRoute && !isAdminAuthenticated) {
    return (
      <div className="min-h-screen bg-ps-dark text-gray-100 flex flex-col justify-center items-center p-6 max-w-md mx-auto relative border-x border-ps-dark-item shadow-2xl">
        {successMsg && (
          <div className="absolute top-16 left-4 right-4 bg-ps-green/20 border border-ps-green text-ps-green px-4 py-3 rounded-lg text-xs font-semibold flex items-center gap-2 z-50 animate-bounce">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
        {error && (
          <div className="absolute top-16 left-4 right-4 bg-ps-neon-pink/20 border border-ps-neon-pink text-white px-4 py-3 rounded-lg text-xs font-semibold flex items-center gap-2 z-50">
            <AlertTriangle className="w-4 h-4 shrink-0 text-ps-neon-pink" />
            <span>{error}</span>
          </div>
        )}

        <div className="w-full bg-ps-dark-card border border-ps-dark-item rounded-2xl p-6 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-ps-neon-pink/15 border border-ps-neon-pink/40 text-ps-neon-pink flex items-center justify-center mx-auto shadow-neon-pink">
              <Settings className="w-6 h-6" />
            </div>
            <h2 className="font-extrabold text-sm uppercase tracking-wider text-white">Вхід до Адмін-панелі</h2>
            <p className="text-[10px] text-gray-400">Введіть пароль адміністратора для керування турніром</p>
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-4 text-xs">
            <div>
              <label className="block text-gray-400 font-semibold mb-1">Пароль Адміна</label>
              <input
                type="password"
                value={adminPasswordInput}
                onChange={(e) => setAdminPasswordInput(e.target.value)}
                placeholder="Введіть пароль"
                className="w-full bg-ps-dark border border-ps-dark-item rounded-xl py-2.5 px-3 text-white focus:outline-none focus:border-ps-neon-pink transition-colors text-center font-bold"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-ps-neon-pink/20 hover:bg-ps-neon-pink border border-ps-neon-pink/45 text-ps-neon-pink hover:text-black font-bold py-3 rounded-xl transition-all shadow-neon-pink"
            >
              УВІЙТИ
            </button>
          </form>

          <button
            onClick={() => navigateTo('/')}
            className="w-full text-center text-[10px] text-gray-400 hover:text-white transition-colors"
          >
            ← Повернутися на головну
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ps-dark text-gray-100 flex flex-col max-w-md mx-auto relative border-x border-ps-dark-item shadow-2xl">
      <header className="sticky top-0 bg-ps-dark-card border-b border-ps-dark-item p-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-ps-blue flex items-center justify-center font-bold text-white shadow-neon-blue">
            PS
          </div>
          <div>
            <h1 className="font-extrabold text-sm uppercase tracking-wider text-white neon-glow-text-blue">
              Cyber League
            </h1>
            <span className="text-[10px] text-gray-400">PS5 Tournament LMS</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isAdminRoute ? (
            <select
              value={selectedPlayerName}
              onChange={(e) => {
                setSelectedPlayerName(e.target.value);
                localStorage.setItem('selectedPlayerName', e.target.value);
              }}
              className="bg-ps-dark border border-ps-dark-item rounded-lg py-1.5 px-2 text-[10px] font-bold text-gray-300 focus:outline-none focus:border-ps-neon-blue transition-colors max-w-[100px]"
            >
              <option value="">👤 Хто ти?</option>
              {players.map(p => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </select>
          ) : (
            <button
              onClick={handleAdminLogout}
              className="px-2.5 py-1.5 rounded-lg bg-ps-neon-pink/15 border border-ps-neon-pink/30 hover:bg-ps-neon-pink text-ps-neon-pink hover:text-black text-[9px] font-bold uppercase transition-all shadow-neon-pink shrink-0"
            >
              Вийти
            </button>
          )}

          <button 
            onClick={fetchData} 
            disabled={loading}
            className="p-2 rounded-full hover:bg-ps-dark-item text-ps-neon-blue transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {successMsg && (
        <div className="absolute top-16 left-4 right-4 bg-ps-green/20 border border-ps-green text-ps-green px-4 py-3 rounded-lg text-xs font-semibold flex items-center gap-2 z-50 animate-bounce">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {error && (
        <div className="absolute top-16 left-4 right-4 bg-ps-neon-pink/20 border border-ps-neon-pink text-white px-4 py-3 rounded-lg text-xs font-semibold flex items-center gap-2 z-50">
          <AlertTriangle className="w-4 h-4 shrink-0 text-ps-neon-pink" />
          <span>{error}</span>
        </div>
      )}

      {selectedPlayerName && !isAdminRoute && (
        <div className="bg-ps-dark-card border-b border-ps-dark-item px-4 py-3 flex items-center justify-between gap-3 text-xs animate-slide-up">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full bg-ps-green animate-pulse shrink-0" />
            <div className="min-w-0">
              <div className="font-extrabold text-white">Профіль: {selectedPlayerName}</div>
              <div className="text-[10px] text-gray-400 truncate">
                Команди: {getSelectedPlayerTeams().join(', ') || 'Немає активних команд'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-ps-yellow/10 border border-ps-yellow/30 px-2.5 py-1.5 rounded-lg shrink-0">
            <span className="font-extrabold text-ps-yellow text-xs">
              {players.find(p => p.name === selectedPlayerName)?.coins_balance ?? 0}
            </span>
            <span className="text-[8px] text-ps-yellow/85 uppercase font-bold tracking-wider">PSC</span>
          </div>
        </div>
      )}

      <main className="flex-1 p-4 pb-24 overflow-y-auto">
        {activeTab === 'match-center' && (
          <div className="space-y-6">
            {selectedTournamentId === null ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">Список турнірів</h2>
                  {isAdminRoute && (
                    <button
                      onClick={() => setShowCreateTournamentModal(true)}
                      className="flex items-center gap-1 bg-ps-blue hover:bg-ps-blue/90 text-white text-[10px] font-bold py-1.5 px-3 rounded-lg shadow-neon-blue transition-all"
                    >
                      <Plus className="w-3 h-3" /> Створити Турнір
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {tournaments.map(t => {
                    const tMatches = matches.filter(m => m.tournament_id === t.id);
                    let statusLabel = 'Створено';
                    let statusClass = 'bg-gray-500/10 border-gray-500 text-gray-400';

                    if (tMatches.length > 0) {
                      const completedCount = tMatches.filter(m => m.status === 'completed').length;
                      if (completedCount === tMatches.length) {
                        statusLabel = 'Завершено';
                        statusClass = 'bg-ps-green/10 border-ps-green text-ps-green';
                      } else {
                        statusLabel = 'Активний';
                        statusClass = 'bg-ps-blue/10 border-ps-blue text-ps-neon-blue shadow-neon-blue';
                      }
                    }

                    return (
                      <div
                        key={t.id}
                        onClick={() => setSelectedTournamentId(t.id)}
                        className="bg-ps-dark-card border border-ps-dark-item hover:border-ps-blue/40 rounded-xl p-4 flex items-center justify-between gap-3 cursor-pointer transition-all duration-300 group"
                      >
                        <div className="min-w-0 flex-1">
                          <h3 className="font-extrabold text-sm text-white truncate">{t.name}</h3>
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
                            <span className="uppercase font-bold text-ps-neon-blue">{t.type}</span>
                            <span>•</span>
                            <span>{new Date(t.date).toLocaleDateString()}</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[9px] font-bold px-2 py-0.5 border rounded-full uppercase tracking-wider ${statusClass}`}>
                            {statusLabel}
                          </span>
                          
                          {isAdminRoute && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTournament(t.id);
                              }}
                              className="p-2 rounded-xl bg-ps-neon-pink/10 border border-ps-neon-pink/20 hover:bg-ps-neon-pink hover:text-black text-ps-neon-pink transition-all duration-300"
                              title="Видалити турнір"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {tournaments.length === 0 && (
                    <div className="text-center text-xs text-gray-500 py-12 bg-ps-dark-card border border-ps-dark-item border-dashed rounded-2xl">
                      <Gamepad2 className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                      <p>Немає створених турнірів.</p>
                      {isAdminRoute && (
                        <button
                          onClick={() => setShowCreateTournamentModal(true)}
                          className="mt-3 text-[10px] bg-ps-blue/20 hover:bg-ps-blue text-ps-neon-blue font-bold px-4 py-2 rounded-xl transition-all"
                        >
                          Створити перший турнір
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setSelectedTournamentId(null);
                      setStats(null);
                    }}
                    className="p-1.5 rounded-lg bg-ps-dark-item text-gray-400 hover:text-white transition-colors"
                  >
                    ← Назад
                  </button>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-extrabold text-sm text-white truncate">
                      {tournaments.find(t => t.id === selectedTournamentId)?.name}
                    </h2>
                    <p className="text-[9px] text-ps-neon-blue font-bold uppercase tracking-widest mt-0.5">
                      Матч-Центр
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">Зараз Грають</h2>
                    {liveMatch && (
                      <span className="bg-ps-green/10 border border-ps-green text-ps-green text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest animate-neon-pulse flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-ps-green animate-ping"></span> Live
                      </span>
                    )}
                  </div>
                  
                  {liveMatch ? (
                    <div className="bg-ps-dark-card border border-ps-neon-blue rounded-2xl p-5 shadow-neon-blue relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-ps-neon-blue/10 to-transparent rounded-bl-full pointer-events-none"></div>
                      
                      <div className="text-center text-[10px] text-ps-neon-blue font-bold uppercase tracking-widest mb-3">
                        {liveMatch.stage}
                      </div>

                      <div className="grid grid-cols-5 items-center gap-2">
                        <div className="col-span-2 text-center">
                          <div className="w-12 h-12 mx-auto rounded-xl bg-ps-blue/20 border border-ps-blue/40 flex items-center justify-center font-bold text-white text-lg mb-2 overflow-hidden">
                            {liveMatch.team1_flag_code ? (
                              <img
                                src={`https://flagcdn.com/w40/${liveMatch.team1_flag_code.toLowerCase()}.png`}
                                alt="flag"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              liveMatch.team1_name.slice(0,2).toUpperCase()
                            )}
                          </div>
                          <h3 className="font-bold text-sm text-white truncate flex items-center justify-center gap-1.5">
                            {renderTeamFlag(liveMatch.team1_flag_code)}
                            <span>{liveMatch.team1_name}</span>
                          </h3>
                          <p className="text-[10px] text-gray-400 mt-0.5 truncate">{liveMatch.player1_name}</p>
                        </div>

                        <div className="col-span-1 text-center">
                          <div className="font-extrabold text-2xl text-ps-neon-blue neon-glow-text-blue">
                            {liveMatch.score1 !== null ? liveMatch.score1 : 0} : {liveMatch.score2 !== null ? liveMatch.score2 : 0}
                          </div>
                        </div>

                        <div className="col-span-2 text-center">
                          <div className="w-12 h-12 mx-auto rounded-xl bg-ps-neon-pink/20 border border-ps-neon-pink/40 flex items-center justify-center font-bold text-white text-lg mb-2 overflow-hidden">
                            {liveMatch.team2_flag_code ? (
                              <img
                                src={`https://flagcdn.com/w40/${liveMatch.team2_flag_code.toLowerCase()}.png`}
                                alt="flag"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              liveMatch.team2_name.slice(0,2).toUpperCase()
                            )}
                          </div>
                          <h3 className="font-bold text-sm text-white truncate flex items-center justify-center gap-1.5">
                            {renderTeamFlag(liveMatch.team2_flag_code)}
                            <span>{liveMatch.team2_name}</span>
                          </h3>
                          <p className="text-[10px] text-gray-400 mt-0.5 truncate">{liveMatch.player2_name}</p>
                        </div>
                      </div>
                      
                      {isAdminRoute && (
                        <div className="mt-4 pt-4 border-t border-ps-dark-item flex gap-2">
                          <button 
                            onClick={() => openCloseMatchModal(liveMatch)}
                            className="w-full bg-ps-neon-blue/10 border border-ps-neon-blue/40 hover:bg-ps-neon-blue hover:text-black text-ps-neon-blue text-xs font-bold py-2 px-3 rounded-xl transition-all duration-300 flex items-center justify-center gap-1.5"
                          >
                            <CheckCircle2 className="w-4 h-4" /> Закрити матч
                          </button>
                        </div>
                      )}
                    </div>
                  ) : pendingMatches.length > 0 ? (
                    <div className="bg-ps-dark-card border border-ps-dark-item rounded-2xl p-5 relative overflow-hidden">
                      <div className="text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-3">
                        Наступний матч програми
                      </div>

                      <div className="grid grid-cols-5 items-center gap-2">
                        <div className="col-span-2 text-center opacity-70">
                          <div className="w-12 h-12 mx-auto rounded-xl bg-ps-dark-item border border-ps-dark-item flex items-center justify-center font-bold text-gray-400 text-lg mb-2 overflow-hidden">
                            {pendingMatches[0].team1_flag_code ? (
                              <img
                                src={`https://flagcdn.com/w40/${pendingMatches[0].team1_flag_code.toLowerCase()}.png`}
                                alt="flag"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              pendingMatches[0].team1_name.slice(0,2).toUpperCase()
                            )}
                          </div>
                          <h3 className="font-bold text-sm text-white truncate flex items-center justify-center gap-1.5">
                            {renderTeamFlag(pendingMatches[0].team1_flag_code)}
                            <span>{pendingMatches[0].team1_name}</span>
                          </h3>
                          <p className="text-[10px] text-gray-400 mt-0.5 truncate">{pendingMatches[0].player1_name}</p>
                        </div>

                        <div className="col-span-1 text-center">
                          <div className="font-extrabold text-lg text-gray-500">VS</div>
                        </div>

                        <div className="col-span-2 text-center opacity-70">
                          <div className="w-12 h-12 mx-auto rounded-xl bg-ps-dark-item border border-ps-dark-item flex items-center justify-center font-bold text-gray-400 text-lg mb-2 overflow-hidden">
                            {pendingMatches[0].team2_flag_code ? (
                              <img
                                src={`https://flagcdn.com/w40/${pendingMatches[0].team2_flag_code.toLowerCase()}.png`}
                                alt="flag"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              pendingMatches[0].team2_name.slice(0,2).toUpperCase()
                            )}
                          </div>
                          <h3 className="font-bold text-sm text-white truncate flex items-center justify-center gap-1.5">
                            {renderTeamFlag(pendingMatches[0].team2_flag_code)}
                            <span>{pendingMatches[0].team2_name}</span>
                          </h3>
                          <p className="text-[10px] text-gray-400 mt-0.5 truncate">{pendingMatches[0].player2_name}</p>
                        </div>
                      </div>

                      {isAdminRoute && (
                        <div className="mt-4 pt-4 border-t border-ps-dark-item">
                          <button 
                            onClick={async () => {
                              try {
                                const res = await fetch(`${API_URL}/api/matches/${pendingMatches[0].id}`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ score1: null, score2: null, status: 'live' })
                                });
                                if (!res.ok) throw new Error('Помилка активації');
                                triggerSuccess('Матч запущено в ефір!');
                                fetchData();
                              } catch (err) {
                                triggerError(err.message);
                              }
                            }}
                            className="w-full bg-ps-blue hover:bg-ps-blue/90 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-neon-blue transition-all flex items-center justify-center gap-1.5"
                          >
                            <Play className="w-4 h-4 fill-white" /> РОЗПОЧАТИ МАТЧ
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-ps-dark-card border border-ps-dark-item border-dashed rounded-2xl p-8 text-center text-gray-500">
                      <Gamepad2 className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                      <p className="text-xs">Наразі немає запланованих матчів.</p>
                    </div>
                  )}
                </div>

                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Наступні в черзі</h2>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {pendingMatches.slice(liveMatch ? 0 : 1).map((match, index) => (
                      <div key={match.id} className="bg-ps-dark-card border border-ps-dark-item hover:border-ps-blue/30 rounded-xl p-3 flex items-center justify-between gap-2 transition-all">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="text-[10px] font-bold text-gray-500 w-5 text-center shrink-0">
                            #{index + (liveMatch ? 1 : 2)}
                          </div>
                          
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between text-xs font-bold text-white mb-0.5">
                              <span className="truncate flex items-center gap-1">
                                {renderTeamFlag(match.team1_flag_code)}
                                <span>{match.team1_name}</span>
                              </span>
                              <span className="text-gray-500 mx-2 shrink-0">vs</span>
                              <span className="truncate text-right flex items-center justify-end gap-1">
                                <span>{match.team2_name}</span>
                                {renderTeamFlag(match.team2_flag_code)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[9px] text-gray-400">
                              <span className="truncate">{match.player1_name}</span>
                              <span className="text-ps-neon-blue shrink-0 uppercase text-[8px] tracking-wider">{match.stage}</span>
                              <span className="truncate text-right">{match.player2_name}</span>
                            </div>
                          </div>
                        </div>
                        
                        {isAdminRoute && (
                          <button 
                            onClick={() => {
                              fetch(`${API_URL}/api/matches/${match.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ score1: null, score2: null, status: 'live' })
                              })
                              .then(() => {
                                triggerSuccess('Матч виведено в Live!');
                                fetchData();
                              })
                              .catch(err => triggerError(err.message));
                            }}
                            className="p-1.5 rounded-lg bg-ps-dark-item hover:bg-ps-blue text-ps-neon-blue hover:text-white transition-all shrink-0"
                            title="Запустити"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    
                    {pendingMatches.length === 0 && (
                      <div className="text-center text-xs text-gray-600 py-4 bg-ps-dark-card/50 rounded-xl border border-ps-dark-item border-dashed">
                        Черга пуста
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Історія матчів</h2>
                  <div className="space-y-2">
                    {completedMatches.map(match => (
                      <div key={match.id} className="bg-ps-dark-card border border-ps-dark-item rounded-xl p-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">{match.stage}</span>
                          <span className="text-[9px] text-gray-500">
                            {new Date(match.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <div className="grid grid-cols-7 items-center gap-1 text-xs">
                          <div className="col-span-2 text-right truncate">
                            <span className="font-bold text-white flex items-center justify-end gap-1 truncate">
                              <span>{match.team1_name}</span>
                              {renderTeamFlag(match.team1_flag_code)}
                            </span>
                            <span className="text-[9px] text-gray-400 block truncate">{match.player1_name}</span>
                          </div>
                          
                          <div className="col-span-3 text-center flex items-center justify-center gap-2">
                            <div className="px-2 py-0.5 rounded bg-ps-dark-item border border-ps-dark-item font-extrabold text-white">
                              {match.score1}
                            </div>
                            <span className="text-gray-500 font-bold">:</span>
                            <div className="px-2 py-0.5 rounded bg-ps-dark-item border border-ps-dark-item font-extrabold text-white">
                              {match.score2}
                            </div>
                          </div>

                          <div className="col-span-2 text-left truncate">
                            <span className="font-bold text-white flex items-center justify-start gap-1 truncate">
                              {renderTeamFlag(match.team2_flag_code)}
                              <span>{match.team2_name}</span>
                            </span>
                            <span className="text-[9px] text-gray-400 block truncate">{match.player2_name}</span>
                          </div>
                        </div>
                      </div>
                    ))}

                    {completedMatches.length === 0 && (
                      <div className="text-center text-xs text-gray-600 py-4">
                        Немає зіграних матчів.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="space-y-6">
            {selectedTournamentId === null ? (
              <div className="text-center text-xs text-gray-500 py-16 bg-ps-dark-card border border-ps-dark-item border-dashed rounded-2xl p-6">
                <Trophy className="w-10 h-10 mx-auto mb-3 text-ps-neon-blue animate-pulse" />
                <h3 className="font-extrabold text-sm text-white mb-1">Статистику не обрано</h3>
                <p className="leading-relaxed">Будь ласка, оберіть турнір у розділі <strong>«Матч-Центр»</strong>, щоб переглянути турнірну таблицю, бомбардирів та баланс коїнів.</p>
                <button
                  onClick={() => setActiveTab('match-center')}
                  className="mt-4 text-[10px] bg-ps-blue/20 hover:bg-ps-blue text-ps-neon-blue font-bold px-4 py-2 rounded-xl transition-all"
                >
                  Перейти до вибору турніру
                </button>
              </div>
            ) : (
              <>
                <div className="flex border-b border-ps-dark-item p-0.5 bg-ps-dark-card rounded-xl">
                  <button
                    onClick={() => setActiveStatsTab('tables')}
                    className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition-all ${
                      activeStatsTab === 'tables' 
                        ? 'bg-ps-blue text-white shadow-neon-blue' 
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Турнірна Таблиця
                  </button>
                  <button
                    onClick={() => setActiveStatsTab('scorers')}
                    className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition-all ${
                      activeStatsTab === 'scorers' 
                        ? 'bg-ps-blue text-white shadow-neon-blue' 
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Бомбардири
                  </button>
                  <button
                    onClick={() => setActiveStatsTab('coins')}
                    className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition-all ${
                      activeStatsTab === 'coins' 
                        ? 'bg-ps-blue text-white shadow-neon-blue' 
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Рейтинг Коїнів
                  </button>
                </div>

                {activeStatsTab === 'tables' && (
                  <div className="space-y-6">
                    {stats?.groupStandings && Object.keys(stats.groupStandings).length > 0 ? (
                      Object.keys(stats.groupStandings).map(groupName => (
                        <div key={groupName} className="bg-ps-dark-card border border-ps-dark-item rounded-2xl p-4">
                          <h3 className="text-xs font-extrabold uppercase tracking-widest text-ps-neon-blue mb-3">
                            {groupName}
                          </h3>
                          
                          <div className="overflow-x-auto">
                            <table className="w-full text-[11px] text-left">
                              <thead>
                                <tr className="text-gray-500 border-b border-ps-dark-item pb-2 uppercase text-[9px] tracking-wider">
                                  <th className="py-1.5 font-bold">Команда</th>
                                  <th className="py-1.5 font-bold text-center w-8">І</th>
                                  <th className="py-1.5 font-bold text-center w-8">РМ</th>
                                  <th className="py-1.5 font-bold text-center w-8">О</th>
                                </tr>
                              </thead>
                              <tbody>
                                {stats.groupStandings[groupName].map((team, idx) => {
                                  const isMyTeam = team.player_name === selectedPlayerName;
                                  return (
                                    <tr 
                                      key={team.id} 
                                      className={`border-b border-ps-dark-item/50 last:border-b-0 transition-all ${
                                        isMyTeam 
                                          ? 'bg-ps-blue/20 border-l-2 border-l-ps-neon-blue' 
                                          : (idx < 2 ? 'bg-ps-blue/5' : '')
                                      }`}
                                    >
                                      <td className="py-2.5 pr-2 font-bold max-w-[120px] truncate text-white">
                                        <div className="truncate flex items-center gap-1.5">
                                          {renderTeamFlag(team.flag_code)}
                                          <span className="truncate">{team.name}</span>
                                        </div>
                                        <div className="text-[9px] text-gray-500 font-normal truncate pl-5.5">{team.player_name}</div>
                                      </td>
                                      <td className="py-2.5 text-center font-semibold text-gray-300">{team.played}</td>
                                      <td className="py-2.5 text-center text-gray-400 font-semibold">
                                        {team.gd > 0 ? `+${team.gd}` : team.gd}
                                      </td>
                                      <td className={`py-2.5 text-center font-bold text-sm ${idx < 2 ? 'text-ps-neon-blue' : 'text-white'}`}>
                                        {team.points}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))
                    ) : stats?.playoffMatches && stats.playoffMatches.length > 0 ? (() => {
                      const stageMap = {};
                      stats.playoffMatches.forEach(m => {
                        if (!stageMap[m.stage]) stageMap[m.stage] = [];
                        stageMap[m.stage].push(m);
                      });
                      const stages = Object.keys(stageMap);
                      const selectedStage = (stages.includes(activePlayoffStageTab)) ? activePlayoffStageTab : stages[0];

                      return (
                        <div className="bg-ps-dark-card border border-ps-dark-item rounded-2xl p-4 space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-extrabold uppercase tracking-widest text-ps-neon-pink">
                              Сітка Плей-оф (Playoffs)
                            </h3>
                          </div>

                          {stages.length > 1 && (
                            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none border-b border-ps-dark-item/50">
                              {stages.map(stg => (
                                <button
                                  key={stg}
                                  type="button"
                                  onClick={() => setActivePlayoffStageTab(stg)}
                                  className={`py-1.5 px-3 rounded-lg text-[9px] font-extrabold uppercase tracking-wider shrink-0 border transition-all duration-300 ${
                                    selectedStage === stg
                                      ? 'bg-ps-neon-pink/15 border-ps-neon-pink text-ps-neon-pink shadow-neon-pink'
                                      : 'bg-ps-dark border-ps-dark-item text-gray-500 hover:text-white'
                                  }`}
                                >
                                  {stg}
                                </button>
                              ))}
                            </div>
                          )}

                          <div className="space-y-2">
                            {(stageMap[selectedStage] || []).map(m => (
                              <div key={m.id} className="bg-ps-dark-item border border-ps-dark-item rounded-xl p-3 text-xs">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="font-bold text-white flex items-center gap-1.5 truncate max-w-[140px]">
                                    {renderTeamFlag(m.team1_flag_code)}
                                    <span className="truncate">{m.team1_name}</span>
                                    <span className="text-[9px] text-gray-400 font-normal shrink-0">({m.player1_name})</span>
                                  </span>
                                  <span className="font-extrabold text-sm text-ps-neon-blue">
                                    {m.status === 'completed' ? m.score1 : '-'}
                                  </span>
                                </div>
                                
                                <div className="flex justify-between items-center">
                                  <span className="font-bold text-white flex items-center gap-1.5 truncate max-w-[140px]">
                                    {renderTeamFlag(m.team2_flag_code)}
                                    <span className="truncate">{m.team2_name}</span>
                                    <span className="text-[9px] text-gray-400 font-normal shrink-0">({m.player2_name})</span>
                                  </span>
                                  <span className="font-extrabold text-sm text-ps-neon-blue">
                                    {m.status === 'completed' ? m.score2 : '-'}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })() : (
                      <div className="text-center text-xs text-gray-500 py-8 bg-ps-dark-card rounded-2xl border border-ps-dark-item">
                        Дані статистики недоступні.
                      </div>
                    )}
                  </div>
                )}

                {activeStatsTab === 'scorers' && (
                  <div className="grid grid-cols-1 gap-6">
                    <div className="bg-ps-dark-card border border-ps-dark-item rounded-2xl p-4">
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-ps-neon-blue mb-3">
                        ⚽ Золота Бутса (Бомбардири)
                      </h3>
                      
                      <div className="space-y-2">
                        {stats?.topScorers && stats.topScorers.length > 0 ? (
                          stats.topScorers.map((player, idx) => (
                            <div key={idx} className="flex items-center justify-between border-b border-ps-dark-item/50 pb-2 last:border-b-0 text-xs">
                              <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded bg-ps-dark-item text-[10px] font-bold text-gray-400 flex items-center justify-center">
                                  {idx + 1}
                                </div>
                                <div>
                                  <div className="font-bold text-white">{player.player_name}</div>
                                  <div className="text-[9px] text-gray-400 flex items-center gap-1">
                                    {renderTeamFlag(player.flag_code, "w-3.5 h-3.5")}
                                    <span>{player.team_name}</span>
                                    {player.owner_player_name && <span className="text-ps-neon-blue font-bold">({player.owner_player_name})</span>}
                                  </div>
                                </div>
                              </div>
                              <div className="font-extrabold text-ps-neon-blue text-sm">
                                {player.goals_count} <span className="text-[9px] font-normal text-gray-500">Гол(ів)</span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center text-[11px] text-gray-600 py-4">Немає забитих голів.</div>
                        )}
                      </div>
                    </div>

                    <div className="bg-ps-dark-card border border-ps-dark-item rounded-2xl p-4">
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-ps-neon-pink mb-3">
                        🎯 Кращі Асистенти
                      </h3>
                      
                      <div className="space-y-2">
                        {stats?.topAssistants && stats.topAssistants.length > 0 ? (
                          stats.topAssistants.map((player, idx) => (
                            <div key={idx} className="flex items-center justify-between border-b border-ps-dark-item/50 pb-2 last:border-b-0 text-xs">
                              <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded bg-ps-dark-item text-[10px] font-bold text-gray-400 flex items-center justify-center">
                                  {idx + 1}
                                </div>
                                <div>
                                  <div className="font-bold text-white">{player.player_name}</div>
                                  <div className="text-[9px] text-gray-400 flex items-center gap-1">
                                    {renderTeamFlag(player.flag_code, "w-3.5 h-3.5")}
                                    <span>{player.team_name}</span>
                                    {player.owner_player_name && <span className="text-ps-neon-pink font-bold">({player.owner_player_name})</span>}
                                  </div>
                                </div>
                              </div>
                              <div className="font-extrabold text-ps-neon-pink text-sm">
                                {player.assists_count} <span className="text-[9px] font-normal text-gray-500">Пас(ів)</span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center text-[11px] text-gray-600 py-4">Немає асистів.</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {activeStatsTab === 'coins' && (
                  <div className="bg-ps-dark-card border border-ps-dark-item rounded-2xl p-4">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-ps-yellow mb-3 flex items-center gap-1.5">
                      <Coins className="w-4 h-4 text-ps-yellow" /> Лідерборд Багатства (PS-Coins)
                    </h3>
                    
                    <div className="space-y-2.5">
                      {stats?.coinsLeaderboard && stats.coinsLeaderboard.length > 0 ? (
                        stats.coinsLeaderboard.map((item, idx) => {
                          const isMe = item.player_name === selectedPlayerName;
                          return (
                            <div 
                              key={idx} 
                              className={`flex items-center justify-between border-b last:border-b-0 text-xs pb-2.5 transition-all ${
                                isMe 
                                  ? 'border-ps-yellow/45 bg-ps-yellow/10 p-2 rounded-xl border shadow-neon-yellow' 
                                  : 'border-ps-dark-item/50'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <div className={`w-6 h-6 rounded-full font-bold flex items-center justify-center text-xs ${
                                  idx === 0 ? 'bg-ps-yellow text-black' : (isMe ? 'bg-ps-yellow/20 text-ps-yellow' : 'bg-ps-dark-item text-gray-400')
                                }`}>
                                  {idx + 1}
                                </div>
                                <span className={`font-bold ${isMe ? 'text-ps-yellow' : 'text-white'}`}>
                                  {item.player_name} {isMe && <span className="text-[8px] font-extrabold uppercase bg-ps-yellow/20 px-1.5 py-0.5 rounded text-ps-yellow ml-1">Ви</span>}
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-1 bg-ps-yellow/10 border border-ps-yellow/30 px-2.5 py-1 rounded-lg">
                                <span className="font-extrabold text-ps-yellow text-sm">{item.coins_balance}</span>
                                <span className="text-[9px] text-ps-yellow/85 uppercase font-bold tracking-wider">PSC</span>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center text-xs text-gray-600 py-4">Рейтинг пустий.</div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'admin' && isAdminRoute && (
          <div className="space-y-6">
            <div className="bg-ps-dark-card border border-ps-dark-item rounded-2xl p-4 space-y-4">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-ps-neon-pink flex items-center gap-1">
                <Edit3 className="w-4 h-4 text-ps-neon Pink" /> Редагування Складів Команд
              </h3>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-gray-400 font-semibold mb-1">Оберіть команду</label>
                  <select
                    value={selectedTeamForPlayers}
                    onChange={(e) => setSelectedTeamForPlayers(e.target.value)}
                    className="w-full bg-ps-dark border border-ps-dark-item rounded-xl py-2.5 px-3 text-white focus:outline-none focus:border-ps-neon-pink transition-colors"
                  >
                    {flatTeams.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.league})</option>
                    ))}
                  </select>
                </div>

                <form onSubmit={handleAddPlayerToRoster} className="flex gap-2">
                  <input
                    type="text"
                    value={newPlayerRosterName}
                    onChange={(e) => setNewPlayerRosterName(e.target.value)}
                    placeholder="Ім'я футболіста"
                    className="flex-1 bg-ps-dark border border-ps-dark-item rounded-xl py-2 px-3 text-white focus:outline-none focus:border-ps-neon-pink transition-colors"
                  />
                  <button
                    type="submit"
                    className="bg-ps-neon-pink/15 border border-ps-neon-pink/40 hover:bg-ps-neon-pink hover:text-black text-ps-neon-pink font-bold px-4 rounded-xl transition-all"
                  >
                    Додати
                  </button>
                </form>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {teamPlayersList.map(player => (
                    <div key={player.id} className="bg-ps-dark border border-ps-dark-item rounded-xl p-2.5 flex items-center justify-between gap-2">
                      <span className="font-bold text-white">{player.name}</span>
                      <button
                        onClick={() => handleDeletePlayerFromRoster(player.id)}
                        className="text-gray-500 hover:text-ps-neon-pink p-1 transition-colors"
                        title="Видалити"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {teamPlayersList.length === 0 && (
                    <div className="text-center text-[10px] text-gray-500 py-4 bg-ps-dark rounded-xl border border-ps-dark-item border-dashed">
                      Склад пустий
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteTeam(selectedTeamForPlayers)}
                  className="w-full border border-ps-neon-pink/30 bg-ps-neon-pink/5 hover:bg-ps-neon-pink/20 text-ps-neon-pink text-xs font-semibold py-2.5 rounded-xl transition-all"
                >
                  Видалити цю команду взагалі
                </button>
              </div>
            </div>

            <div className="bg-ps-dark-card border border-ps-dark-item rounded-2xl p-4 space-y-4">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-white flex items-center gap-1">
                <Plus className="w-4 h-4 text-white" /> Створення нової команди
              </h3>

              <form onSubmit={handleCreateTeam} className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-gray-400 font-semibold mb-1">Назва команди</label>
                    <input
                      type="text"
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      placeholder="Напр. Real Madrid"
                      className="w-full bg-ps-dark border border-ps-dark-item rounded-xl py-2 px-3 text-white focus:outline-none focus:border-ps-neon-blue transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 font-semibold mb-1">Ліга</label>
                    <select
                      value={newTeamLeague}
                      onChange={(e) => setNewTeamLeague(e.target.value)}
                      className="w-full bg-ps-dark border border-ps-dark-item rounded-xl py-2.5 px-3 text-white focus:outline-none focus:border-ps-neon-blue transition-colors"
                    >
                      <option value="Premier League">Англійська ліга</option>
                      <option value="La Liga">Іспанська ліга</option>
                      <option value="Bundesliga">Німецька ліга</option>
                      <option value="Serie A">Італійська ліга</option>
                      <option value="National Teams">Збірні</option>
                      <option value="Custom">Інше</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-gray-400 font-semibold mb-1">Код прапора (flagcdn)</label>
                  <input
                    type="text"
                    value={newTeamFlagCode}
                    onChange={(e) => setNewTeamFlagCode(e.target.value)}
                    placeholder="Напр. ua, fr, ar (дволітерний код країни)"
                    className="w-full bg-ps-dark border border-ps-dark-item rounded-xl py-2 px-3 text-white focus:outline-none focus:border-ps-neon-blue transition-colors"
                  />
                </div>

                <div className="space-y-2 bg-ps-dark p-3 rounded-xl border border-ps-dark-item">
                  <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Характеристики команди</div>
                  
                  <div>
                    <div className="flex justify-between mb-0.5 text-gray-400">
                      <span>Атака</span>
                      <span className="font-bold text-white">{newTeamAttack}</span>
                    </div>
                    <input
                      type="range" min="1" max="99" value={newTeamAttack}
                      onChange={(e) => setNewTeamAttack(parseInt(e.target.value))}
                      className="w-full accent-ps-neon-blue"
                    />
                  </div>
                  
                  <div>
                    <div className="flex justify-between mb-0.5 text-gray-400">
                      <span>Півзахист</span>
                      <span className="font-bold text-white">{newTeamMidfield}</span>
                    </div>
                    <input
                      type="range" min="1" max="99" value={newTeamMidfield}
                      onChange={(e) => setNewTeamMidfield(parseInt(e.target.value))}
                      className="w-full accent-ps-neon-blue"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-0.5 text-gray-400">
                      <span>Захист</span>
                      <span className="font-bold text-white">{newTeamDefense}</span>
                    </div>
                    <input
                      type="range" min="1" max="99" value={newTeamDefense}
                      onChange={(e) => setNewTeamDefense(parseInt(e.target.value))}
                      className="w-full accent-ps-neon-blue"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-0.5 text-gray-400">
                      <span>Загальний рейтинг (OVR)</span>
                      <span className="font-bold text-ps-neon-blue">{newTeamOverall}</span>
                    </div>
                    <input
                      type="range" min="1" max="99" value={newTeamOverall}
                      onChange={(e) => setNewTeamOverall(parseInt(e.target.value))}
                      className="w-full accent-ps-neon-blue"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-400 font-semibold mb-1">Склад футболістів (через кому)</label>
                  <textarea
                    value={newTeamRoster}
                    onChange={(e) => setNewTeamRoster(e.target.value)}
                    placeholder="Напр. Cole Palmer, Nicolas Jackson, Enzo Fernandez"
                    className="w-full bg-ps-dark border border-ps-dark-item rounded-xl py-2 px-3 text-white focus:outline-none focus:border-ps-neon-blue transition-colors h-16 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-ps-blue hover:bg-ps-blue/90 text-white font-bold py-2.5 rounded-xl transition-all"
                >
                  Зберегти Команду
                </button>
              </form>
            </div>

            <div className="bg-ps-dark-card border border-ps-dark-item rounded-2xl p-4 space-y-4">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-ps-neon-blue flex items-center gap-1.5">
                <Users className="w-4 h-4 text-ps-neon-blue" /> Керування Гравцями (Франшизами)
              </h3>

              <form onSubmit={handleRegisterPlayer} className="space-y-3 text-xs">
                <div>
                  <label className="block text-gray-400 font-semibold mb-1">Новий гравець (ім'я)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newPlayerName}
                      onChange={(e) => setNewPlayerName(e.target.value)}
                      placeholder="Напр. Yaroslav"
                      className="flex-1 bg-ps-dark border border-ps-dark-item rounded-xl py-2 px-3 text-white focus:outline-none focus:border-ps-neon-blue transition-colors font-bold"
                    />
                    <button
                      type="submit"
                      disabled={loading}
                      className="bg-ps-blue hover:bg-ps-blue/90 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-xl shadow-neon-blue transition-all shrink-0"
                    >
                      Додати
                    </button>
                  </div>
                </div>
              </form>

              <div className="space-y-2 pt-2 border-t border-ps-dark-item/50">
                <label className="block text-[10px] text-gray-400 uppercase font-bold tracking-wider">Список учасників</label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {players.map(p => (
                    <div key={p.id} className="bg-ps-dark border border-ps-dark-item rounded-xl p-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-white">{p.name}</span>
                        <span className="text-[9px] text-ps-yellow bg-ps-yellow/10 border border-ps-yellow/20 px-1.5 py-0.5 rounded font-bold">{p.coins_balance} PSC</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeletePlayer(p.id, p.name)}
                        className="p-1.5 rounded-lg bg-ps-neon-pink/10 border border-ps-neon-pink/20 hover:bg-ps-neon-pink hover:text-black text-ps-neon-pink transition-all"
                        title="Видалити гравця"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {players.length === 0 && (
                    <div className="text-center text-xs text-gray-600 py-2">
                      Гравців немає.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 3. CONFLICT RESOLUTION (PLAYOFF TEAM OWNER TRANSFER) */}
            <div className="bg-ps-dark-card border border-ps-dark-item rounded-2xl p-4 space-y-4">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-ps-yellow flex items-center gap-1">
                <AlertTriangle className="w-4 h-4 text-ps-yellow" /> Вирішення конфліктів у плей-оф
              </h3>
              
              <p className="text-[10px] text-gray-400 leading-relaxed">
                Оберіть турнір, а потім конкретний матч, щоб передати керування однією з команд учаснику, який зараз вільний (вибув з турніру).
              </p>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-gray-400 font-semibold mb-1">Оберіть турнір</label>
                  <select
                    value={resolverTournamentId || ''}
                    onChange={(e) => {
                      setResolverTournamentId(e.target.value);
                      setTransferMatchId('');
                      setTransferTeamId('');
                      setTransferNewPlayerId('');
                    }}
                    className="w-full bg-ps-dark border border-ps-dark-item rounded-xl py-2.5 px-3 text-white focus:outline-none focus:border-ps-yellow transition-colors font-bold"
                  >
                    <option value="">-- Оберіть турнір --</option>
                    {tournaments.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.type})</option>
                    ))}
                  </select>
                </div>

                {resolverTournamentId && (
                  <div className="space-y-2">
                    <label className="block text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">Матчі стадії плей-оф</label>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {matches
                        .filter(m => m.tournament_id === parseInt(resolverTournamentId) && m.status === 'pending' && !m.stage.includes('Група'))
                        .map(m => {
                          const isConflict = m.player1_name === m.player2_name;
                          const isSelected = parseInt(transferMatchId) === m.id;

                          return (
                            <div 
                              key={m.id}
                              onClick={() => {
                                setTransferMatchId(m.id.toString());
                                setTransferTeamId('');
                                setTransferNewPlayerId('');
                              }}
                              className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                                isSelected 
                                  ? 'bg-ps-yellow/10 border-ps-yellow shadow-neon-yellow' 
                                  : isConflict 
                                    ? 'bg-ps-neon-pink/5 border-ps-neon-pink/40 hover:border-ps-neon-pink animate-pulse' 
                                    : 'bg-ps-dark border-ps-dark-item hover:border-gray-600'
                              }`}
                            >
                              <div className="flex justify-between items-center mb-1.5">
                                <span className="text-[9px] font-extrabold bg-ps-dark-item px-2 py-0.5 rounded text-gray-400 uppercase tracking-wider">
                                  {m.stage}
                                </span>
                                {isConflict && (
                                  <span className="text-[8px] font-extrabold text-ps-neon-pink bg-ps-neon-pink/10 px-1.5 py-0.5 rounded uppercase">
                                    ⚠️ Конфлікт самоігри
                                  </span>
                                )}
                              </div>
                              <div className="flex justify-between items-center text-white font-bold text-xs">
                                <span className="truncate">{m.team1_name} ({m.player1_name})</span>
                                <span className="text-gray-500 px-1 text-[10px]">vs</span>
                                <span className="truncate text-right">{m.team2_name} ({m.player2_name})</span>
                              </div>
                            </div>
                          );
                        })}

                      {matches.filter(m => m.tournament_id === parseInt(resolverTournamentId) && m.status === 'pending' && !m.stage.includes('Група')).length === 0 && (
                        <div className="text-center text-[10px] text-gray-500 py-6 bg-ps-dark border border-ps-dark-item border-dashed rounded-xl">
                          Немає активних матчів плей-оф для цього турніру.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {transferMatchId && (
                  <div className="bg-ps-dark p-3 rounded-xl border border-ps-dark-item space-y-3 animate-slide-up">
                    <div className="text-[10px] uppercase font-bold text-ps-yellow tracking-wider">Налаштування передачі контролю</div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-gray-400 text-[10px] mb-1">Яку команду віддати?</label>
                        <select
                          value={transferTeamId}
                          onChange={(e) => setTransferTeamId(e.target.value)}
                          className="w-full bg-ps-dark-card border border-ps-dark-item rounded-lg py-2 px-2 text-white font-semibold focus:outline-none focus:border-ps-yellow"
                        >
                          <option value="">-- Оберіть --</option>
                          {(() => {
                            const m = matches.find(x => x.id === parseInt(transferMatchId));
                            return m ? (
                              <>
                                <option value={m.team1_id}>{m.team1_name} ({m.player1_name})</option>
                                <option value={m.team2_id}>{m.team2_name} ({m.player2_name})</option>
                              </>
                            ) : null;
                          })()}
                        </select>
                      </div>

                      <div>
                        <label className="block text-gray-400 text-[10px] mb-1">Кому передати?</label>
                        <select
                          value={transferNewPlayerId}
                          onChange={(e) => setTransferNewPlayerId(e.target.value)}
                          className="w-full bg-ps-dark-card border border-ps-dark-item rounded-lg py-2 px-2 text-white font-semibold focus:outline-none focus:border-ps-yellow"
                        >
                          <option value="">-- Вільний гравець --</option>
                          {players
                            .filter(p => {
                              const m = matches.find(x => x.id === parseInt(transferMatchId));
                              if (!m) return true;
                              return p.name !== m.player1_name;
                            })
                            .map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleTransferPlayoffTeam}
                      disabled={loading || !transferTeamId || !transferNewPlayerId}
                      className="w-full bg-ps-yellow/20 hover:bg-ps-yellow border border-ps-yellow/45 text-ps-yellow hover:text-black disabled:opacity-30 font-bold py-2.5 rounded-xl transition-all shadow-neon-yellow"
                    >
                      ПІДТВЕРДИТИ ПЕРЕДАЧУ КОМАНДИ
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'banner-gen' && isAdminRoute && (
          <div className="space-y-6">
            <div className="bg-ps-dark-card border border-ps-dark-item rounded-2xl p-4 space-y-4">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-ps-neon-blue flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-ps-neon-blue" /> Генератор банерів матчів
              </h3>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-gray-400 font-semibold mb-1">Автовведення з черги матчів</label>
                  <select
                    value={bannerMatchId}
                    onChange={(e) => handleSelectBannerMatch(e.target.value)}
                    className="w-full bg-ps-dark border border-ps-dark-item rounded-xl py-2.5 px-3 text-white focus:outline-none focus:border-ps-neon-blue transition-colors"
                  >
                    <option value="">-- Оберіть матч --</option>
                    {pendingMatches.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.player1_name} ({m.team1_name}) vs {m.player2_name} ({m.team2_name})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-ps-dark p-3 rounded-xl border border-ps-dark-item">
                  <div className="col-span-2 text-[10px] uppercase font-bold text-ps-neon-blue tracking-wider">Команда 1 (Ліва)</div>
                  <div>
                    <label className="block text-gray-400 text-[10px] mb-0.5">Назва команди</label>
                    <input
                      type="text" value={bannerTeam1} onChange={(e) => setBannerTeam1(e.target.value)}
                      className="w-full bg-ps-dark-card border border-ps-dark-item rounded-lg py-1.5 px-2 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-[10px] mb-0.5">Власник (Гравець)</label>
                    <input
                      type="text" value={bannerPlayer1} onChange={(e) => setBannerPlayer1(e.target.value)}
                      className="w-full bg-ps-dark-card border border-ps-dark-item rounded-lg py-1.5 px-2 text-white text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-ps-dark p-3 rounded-xl border border-ps-dark-item">
                  <div className="col-span-2 text-[10px] uppercase font-bold text-ps-neon-pink tracking-wider">Команда 2 (Права)</div>
                  <div>
                    <label className="block text-gray-400 text-[10px] mb-0.5">Назва команди</label>
                    <input
                      type="text" value={bannerTeam2} onChange={(e) => setBannerTeam2(e.target.value)}
                      className="w-full bg-ps-dark-card border border-ps-dark-item rounded-lg py-1.5 px-2 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-[10px] mb-0.5">Власник (Gradets)</label>
                    <input
                      type="text" value={bannerPlayer2} onChange={(e) => setBannerPlayer2(e.target.value)}
                      className="w-full bg-ps-dark-card border border-ps-dark-item rounded-lg py-1.5 px-2 text-white text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-400 font-semibold mb-2">Передогляд банера (800x450)</label>
                  <div className="w-full border border-ps-dark-item rounded-2xl overflow-hidden aspect-video bg-black flex items-center justify-center">
                    <canvas 
                      ref={canvasRef} 
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={downloadBannerImage}
                  className="w-full bg-ps-blue hover:bg-ps-blue/90 text-white font-bold py-3 rounded-xl shadow-neon-blue transition-all flex items-center justify-center gap-1.5"
                >
                  <Download className="w-4 h-4" /> ЗАВАНТАЖИТИ КАРТКУ АНОНСУ
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {activeClosingMatch && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center p-4">
          <div className="bg-ps-dark-card border border-ps-dark-item rounded-t-3xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between border-b border-ps-dark-item pb-3">
              <div>
                <h3 className="font-extrabold text-sm text-white">Внесення результату</h3>
                <span className="text-[10px] text-ps-neon-blue uppercase tracking-widest font-bold">{activeClosingMatch.stage}</span>
              </div>
              <button 
                onClick={() => setActiveClosingMatch(null)}
                className="text-gray-400 hover:text-white text-xs font-bold uppercase tracking-wider py-1 px-3 bg-ps-dark-item rounded-xl"
              >
                Закрити
              </button>
            </div>

            <form onSubmit={handleSubmitMatchResult} className="space-y-4 text-xs">
              <div className="grid grid-cols-7 items-center text-center bg-ps-dark p-4 rounded-2xl border border-ps-dark-item">
                <div className="col-span-2">
                  <div className="font-extrabold text-sm text-white truncate mb-1">{activeClosingMatch.team1_name}</div>
                  <input
                    type="number" min="0" value={score1} onChange={(e) => setScore1(e.target.value)}
                    className="w-12 bg-ps-dark-card border border-ps-dark-item rounded-xl py-1.5 text-center font-extrabold text-white text-lg focus:outline-none focus:border-ps-neon-blue"
                  />
                </div>
                
                <div className="col-span-3 text-gray-500 font-extrabold text-lg">:</div>

                <div className="col-span-2">
                  <div className="font-extrabold text-sm text-white truncate mb-1">{activeClosingMatch.team2_name}</div>
                  <input
                    type="number" min="0" value={score2} onChange={(e) => setScore2(e.target.value)}
                    className="w-12 bg-ps-dark-card border border-ps-dark-item rounded-xl py-1.5 text-center font-extrabold text-white text-lg focus:outline-none focus:border-ps-neon-blue"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-gray-400 font-bold uppercase text-[9px] tracking-wider">Протокол голів матчу</label>
                  <div className="flex gap-2">
                    <button
                      type="button" onClick={() => addGoalRow(activeClosingMatch.team1_id)}
                      className="bg-ps-blue/15 border border-ps-blue/40 text-ps-neon-blue py-1 px-2.5 rounded-lg text-[10px] font-bold"
                    >
                      + {activeClosingMatch.team1_name}
                    </button>
                    <button
                      type="button" onClick={() => addGoalRow(activeClosingMatch.team2_id)}
                      className="bg-ps-neon-pink/15 border border-ps-neon-pink/40 text-ps-neon-pink py-1 px-2.5 rounded-lg text-[10px] font-bold"
                    >
                      + {activeClosingMatch.team2_name}
                    </button>
                  </div>
                </div>

                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {matchGoals.map((g, idx) => {
                    const isTeam1Goal = g.team_id === activeClosingMatch.team1_id;
                    const squad = isTeam1Goal ? competingPlayers.team1 : competingPlayers.team2;

                    return (
                      <div key={idx} className="flex gap-1.5 items-center bg-ps-dark p-2 rounded-xl border border-ps-dark-item">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${isTeam1Goal ? 'bg-ps-blue shadow-neon-blue' : 'bg-ps-neon-pink shadow-neon-pink'}`}></span>
                        
                        <select
                          value={g.scorer_id}
                          onChange={(e) => updateGoalRow(idx, 'scorer_id', e.target.value)}
                          className="flex-1 bg-ps-dark-card border border-ps-dark-item rounded-lg py-1 px-1.5 text-[10px] text-white focus:outline-none"
                        >
                          <option value="">-- Автор --</option>
                          {squad.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>

                        <select
                          value={g.assistant_id}
                          onChange={(e) => updateGoalRow(idx, 'assistant_id', e.target.value)}
                          className="flex-1 bg-ps-dark-card border border-ps-dark-item rounded-lg py-1 px-1.5 text-[10px] text-white focus:outline-none"
                        >
                          <option value="">-- Асистент --</option>
                          {squad.filter(p => p.id !== g.scorer_id).map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>

                        <input
                          type="number" placeholder="Хв" min="1" max="120" value={g.minute}
                          onChange={(e) => updateGoalRow(idx, 'minute', e.target.value)}
                          className="w-10 bg-ps-dark-card border border-ps-dark-item rounded-lg py-1 text-center text-[10px] text-white"
                        />

                        <button
                          type="button" onClick={() => removeGoalRow(idx)}
                          className="text-gray-500 hover:text-ps-neon-pink shrink-0 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                  {matchGoals.length === 0 && (
                    <div className="text-center text-[10px] text-gray-500 py-3 bg-ps-dark/50 rounded-xl border border-ps-dark-item border-dashed">
                      Забиті голи відсутні у протоколі. Додайте автора, якщо рахунок більший за 0.
                    </div>
                  )}
                </div>
              </div>

              {activeClosingMatch.stage.includes('Playoff') && (
                <div className="bg-ps-dark p-3 rounded-2xl border border-ps-dark-item space-y-2">
                  <label className="text-gray-400 font-bold uppercase text-[9px] tracking-wider block mb-1">Вихід у наступний раунд (+50 коїнів)</label>
                  
                  <label className="flex items-center gap-2 text-white">
                    <input
                      type="checkbox" checked={player1Advanced}
                      onChange={(e) => setPlayer1Advanced(e.target.checked)}
                      className="w-4 h-4 accent-ps-neon-blue"
                    />
                    <span>{activeClosingMatch.player1_name} пройшов далі</span>
                  </label>

                  <label className="flex items-center gap-2 text-white">
                    <input
                      type="checkbox" checked={player2Advanced}
                      onChange={(e) => setPlayer2Advanced(e.target.checked)}
                      className="w-4 h-4 accent-ps-neon-blue"
                    />
                    <span>{activeClosingMatch.player2_name} пройшов далі</span>
                  </label>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-ps-green/20 hover:bg-ps-green border border-ps-green/45 text-ps-green hover:text-black font-bold py-3 rounded-xl transition-all"
              >
                ЗАПИСАТИ РЕЗУЛЬТАТ ТА НАРАХУВАТИ КОЇНИ
              </button>
            </form>
          </div>
        </div>
      )}

      {showCreateTournamentModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center p-4">
          <div className="bg-ps-dark-card border border-ps-dark-item rounded-t-3xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between border-b border-ps-dark-item pb-3">
              <div>
                <h3 className="font-extrabold text-sm text-white">Новий турнір</h3>
                <span className="text-[10px] text-ps-neon-blue uppercase tracking-widest font-bold">Параметри змагання</span>
              </div>
              <button 
                onClick={() => setShowCreateTournamentModal(false)}
                className="text-gray-400 hover:text-white text-xs font-bold uppercase tracking-wider py-1 px-3 bg-ps-dark-item rounded-xl"
              >
                Закрити
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-400 font-semibold mb-1">Назва турніру</label>
                <input
                  type="text"
                  value={tournamentName}
                  onChange={(e) => setTournamentName(e.target.value)}
                  placeholder="Напр. Кубок Ліги 2026"
                  className="w-full bg-ps-dark border border-ps-dark-item rounded-xl py-2.5 px-3 text-white focus:outline-none focus:border-ps-neon-blue transition-colors"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-gray-400 font-semibold">Гравці турніру ({tourneyPlayers.length})</label>
                  <button
                    type="button"
                    onClick={() => {
                      setTourneyPlayers([...tourneyPlayers, `Гравець ${tourneyPlayers.length + 1}`]);
                      setSelectedTeamIds([]);
                    }}
                    className="text-[10px] bg-ps-blue/15 border border-ps-blue/40 text-ps-neon-blue font-bold px-2.5 py-1 rounded-lg hover:bg-ps-blue hover:text-white transition-all"
                  >
                    + Додати Гравця
                  </button>
                </div>
                
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {tourneyPlayers.map((p, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        value={p}
                        onChange={(e) => {
                          const updated = [...tourneyPlayers];
                          updated[idx] = e.target.value;
                          setTourneyPlayers(updated);
                        }}
                        placeholder={`Гравець ${idx + 1}`}
                        className="w-full bg-ps-dark border border-ps-dark-item rounded-xl py-2 px-3 text-white focus:outline-none focus:border-ps-neon-blue transition-colors text-center font-semibold"
                      />
                      {tourneyPlayers.length > 2 && (
                        <button
                          type="button"
                          onClick={() => {
                            setTourneyPlayers(tourneyPlayers.filter((_, i) => i !== idx));
                            setSelectedTeamIds([]);
                          }}
                          className="p-2 bg-ps-neon-pink/10 border border-ps-neon-pink/30 hover:bg-ps-neon-pink hover:text-black text-ps-neon-pink rounded-xl transition-all shrink-0"
                          title="Видалити гравця"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-400 font-semibold mb-1">К-ть команд на гравця (N)</label>
                  <select
                    value={tourneyN}
                    onChange={(e) => {
                      setTourneyN(parseInt(e.target.value));
                      setSelectedTeamIds([]);
                    }}
                    className="w-full bg-ps-dark border border-ps-dark-item rounded-xl py-2.5 px-3 text-white focus:outline-none focus:border-ps-neon-blue transition-colors"
                  >
                    <option value="1">1 команда</option>
                    <option value="2">2 команди</option>
                    <option value="3">3 команди</option>
                    <option value="4">4 команди</option>
                    <option value="5">5 команд</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-gray-400 font-semibold mb-1">Тип турніру</label>
                  <select
                    value={tourneyType}
                    onChange={(e) => setTourneyType(e.target.value)}
                    className="w-full bg-ps-dark border border-ps-dark-item rounded-xl py-2.5 px-3 text-white focus:outline-none focus:border-ps-neon-blue transition-colors"
                  >
                    <option value="Groups+Playoff">Групи+Плей-оф</option>
                    <option value="Playoff">Суто Плей-оф</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-gray-400 font-semibold">Оберіть команди ({selectedTeamIds.length} / {tourneyPlayers.length * tourneyN})</label>
                  <span className="text-[10px] text-ps-neon-blue font-bold">
                    {selectedTeamIds.length === (tourneyPlayers.length * tourneyN) ? 'Достатньо!' : `Потрібно ще ${(tourneyPlayers.length * tourneyN) - selectedTeamIds.length}`}
                  </span>
                </div>

                <div className="flex gap-1 overflow-x-auto pb-2 pr-1 scrollbar-thin">
                  {Object.keys(teams).map(league => (
                    <button
                      key={league}
                      type="button"
                      onClick={() => setSelectedLeagueTab(league)}
                      className={`py-1 px-3 rounded-lg text-[10px] font-bold shrink-0 border uppercase tracking-wider transition-colors ${
                        selectedLeagueTab === league 
                          ? 'bg-ps-blue/20 border-ps-neon-blue text-ps-neon-blue shadow-neon-blue'
                          : 'bg-ps-dark border-ps-dark-item text-gray-400'
                      }`}
                    >
                      {league}
                    </button>
                  ))}
                </div>

                <div className="bg-ps-dark border border-ps-dark-item rounded-xl p-3 grid grid-cols-2 gap-2 max-h-48 overflow-y-auto mt-2">
                  {teams[selectedLeagueTab]?.map(team => {
                    const isSelected = selectedTeamIds.includes(team.id);
                    return (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => toggleTeamSelection(team.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all duration-300 ${
                          isSelected 
                            ? 'bg-ps-neon-blue/10 border-ps-neon-blue text-white shadow-neon-blue' 
                            : 'bg-ps-dark-card border-ps-dark-item text-gray-300 hover:border-gray-600'
                        }`}
                      >
                        <div className="font-bold text-xs truncate flex items-center gap-1.5">
                          {renderTeamFlag(team.flag_code, "w-3.5 h-3.5")}
                          <span className="truncate">{team.name}</span>
                        </div>
                        <div className="text-[9px] text-gray-400 mt-0.5">Рейтинг: {team.overall}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  await handleGenerateTournament();
                  setShowCreateTournamentModal(false);
                }}
                disabled={loading || selectedTeamIds.length !== tourneyPlayers.length * tourneyN}
                className="w-full bg-ps-blue hover:bg-ps-blue/90 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-neon-blue transition-all flex items-center justify-center gap-1.5 mt-2"
              >
                <Play className="w-4 h-4 fill-white" /> СТВОРИТИ ТУРНІР
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-ps-dark-card border-t border-ps-dark-item flex items-center justify-around py-3 px-2 z-10 shadow-2xl">
        <button
          onClick={() => setActiveTab('match-center')}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === 'match-center' ? 'text-ps-neon-blue neon-glow-text-blue font-bold scale-110' : 'text-gray-400 hover:text-white'
          }`}
        >
          <Gamepad2 className="w-5 h-5" />
          <span className="text-[10px]">Матч-Центр</span>
        </button>
        
        <button
          onClick={() => setActiveTab('stats')}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === 'stats' ? 'text-ps-neon-blue neon-glow-text-blue font-bold scale-110' : 'text-gray-400 hover:text-white'
          }`}
        >
          <Trophy className="w-5 h-5" />
          <span className="text-[10px]">Статистика</span>
        </button>

        {isAdminRoute && (
          <>
            <button
              onClick={() => setActiveTab('admin')}
              className={`flex flex-col items-center gap-1 transition-all ${
                activeTab === 'admin' ? 'text-ps-neon-blue neon-glow-text-blue font-bold scale-110' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Settings className="w-5 h-5" />
              <span className="text-[10px]">Адмінка</span>
            </button>

            <button
              onClick={() => setActiveTab('banner-gen')}
              className={`flex flex-col items-center gap-1 transition-all ${
                activeTab === 'banner-gen' ? 'text-ps-neon-blue neon-glow-text-blue font-bold scale-110' : 'text-gray-400 hover:text-white'
              }`}
            >
              <ImageIcon className="w-5 h-5" />
              <span className="text-[10px]">Банери</span>
            </button>
          </>
        )}
      </nav>
    </div>
  );
}

export default App;