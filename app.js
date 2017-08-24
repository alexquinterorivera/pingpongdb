const express = require('express');
const app = express();
const co = require('co');
const sqlite3 = require('co-sqlite3');
let connection;

function checkInternet(cb) {
    require('dns').lookup('google.com',function(err) {
        if (err && err.code == "ENOTFOUND") {
            cb(false);
        } else {
            cb(true);
        }
    })
}

// example usage:
setInterval(() => {checkInternet(function(isConnected) {
    if (isConnected) {
        if(!connection){
            connection = true;
            console.log('// connected to the internet');
        }
    } else {
        if(connection){
            connection = false;
            console.log('// not connected to the internet');
        }
        
    }
})},5000);

let JSON_SQL = (tablename,json,update) => {
    let newJSON = JSON.parse(json);    
}

app.get('/getPlayers', (req,res) => {
    let sql = "SELECT * FROM players";
    co(function *(){
        let db = yield sqlite3('./db/pingpong.db');
        let rows = yield db.all(sql);
        res.send(rows);
        db.close();
    });
});

app.get('/getPlayerStats', (req,res) => {
    co(function *(){
        let playerStats = {};
        let playersArray = [];
        let q = {
            getPlayers:'SELECT * FROM players',
            getStats: 'SELECT * FROM scoreboard'
        }
        let db = yield sqlite3('./db/pingpong.db');
        let players = yield db.all(q.getPlayers);

        for(let i=0;i<players.length;i++){
            let id = players[i].id;
            playerStats[id] = players[i];
            let sql = `
                SELECT
                    CASE when player1=${id} then player1 else player2 END as id,
                    COUNT(winner) as games_played,
                    SUM(CASE when winner = ${id} then 1 else 0 END) as wins,
                    SUM(CASE when player1 = ${id} then p1score else 0 END + CASE when player2 = ${id} then p2score else 0 END) as p1total,
                    SUM(CASE when player1 != ${id} then p1score else 0 END + CASE when player2 != ${id} then p2score else 0 END) as p2total,
                    ROUND(AVG(CASE when timeplayed >= 30 then timeplayed else 0 END)) as avg_playtime_s,
                    SUM(p1score + p2score) as totalscore,
                    player.Name as name,
                    player.elo as elo
                FROM
                    scoreboard
                LEFT JOIN
                    players as player ON CASE when player1=${id} then player1 else player2 END = player.id
                WHERE 1
                    AND player1 = ${id} OR player2 = ${id}
                ORDER BY 
                    id
            `;
            playersArray.push(db.all(sql));
        };
        let data = yield playersArray;
        
        for(let i=0;i<data.length;i++){
            let playerinfo = data[i][0];
            for(let key in playerinfo){
                let id = playerinfo.id;
                if(id != null){
                    playerStats[id][key] = playerinfo[key];
                }
            }
        }
        
        res.send(playerStats);
        db.close();
    })
})

app.get('/setSave/:match/:winner', (req,res) => {

    let match = JSON.parse(req.params.match);
    let p1 = match.p1;
    let p2 = match.p2;
    let winner = req.params.winner;

    co(function *(){
        let db = yield sqlite3('./db/pingpong.db');
        let updatePlayers = yield db.prepare(`UPDATE players SET elo = ? WHERE id = ?`);
        let updateMatch = yield db.prepare(`INSERT INTO scoreboard (player1,player2,timeplayed,p1score,p2score,winner) VALUES (?,?,?,?,?,?)`);
        
        yield updatePlayers.run(p1.elo,p1.id);
        yield updatePlayers.run(p2.elo,p2.id);

        yield updateMatch.run(p1.id,p2.id,match.timeplayed,p1.score,p2.score,winner);
        
        res.send({success:true});
        
    });
});

app.get('/getMatchHistory/:p1/:p2', (req,res) => {
    //find all games in history
    let p1 = req.params.p1;
    let p2 = req.params.p2;
    
    let sql = `
        SELECT date, timeplayed as time, p1score, p2score , player.name as name, scoreboard.winner as winnerID
            FROM scoreboard LEFT JOIN players as player
            ON scoreboard.winner = player.id
        WHERE player1 = ${p1} AND player2 = ${p2}
            OR player1 = ${p2} AND player2 = ${p1}
        ORDER BY date ASC;
    `;

    co(function *(){
        let db = yield sqlite3('./db/pingpong.db');

        let games = yield db.all(sql);

        if(!games){
            res.send({message: 'You havent played each other yet!'});
        }else{
            res.send(games);
        }
        db.close();
    })
})

let getMatchInfo = (p1,p2) => {
    var playerQuery = [
        `
            SELECT DISTINCT(COUNT(*)) as c
            FROM scoreboard
            WHERE 
                player1 = ${p1} AND player2 = ${p2}
            OR 
                player2 = ${p1} AND player1 = ${p2};
        `,
        `
            SELECT DISTINCT(COUNT(*)) as c
                FROM scoreboard
                WHERE
                    player1 = ${p1} AND player2 = ${p2} AND winner = ${p1}
                OR
                    player1 = ${p2} AND player2 = ${p1} AND winner = ${p1}
        `
    ];
    return playerQuery;
}

app.get('/getMatchStats/:p1/:p2', (req, res) => {
    co(function *(){
        let p1 = req.params.p1;
        let p2 = req.params.p2;
        
        let db = yield sqlite3('./db/pingpong.db');
        
        let p1Games = yield db.all(getMatchInfo(p1,p2)[0]);
        let p1Wins = yield db.all(getMatchInfo(p1,p2)[1]);
        let p2Games = yield db.all(getMatchInfo(p2,p1)[0]);
        let p2Wins = yield db.all(getMatchInfo(p2,p1)[1]);

        res.send({
            p1: {
                games: p1Games[0].c,
                wins: p1Wins[0].c
            },
            p2: {
                games: p2Games[0].c,
                wins: p2Wins[0].c
            }
        })
        db.close();
    })
})

app.listen('3000', () => {
    console.log('server started');
});