const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser')
const cookieParser=require('cookie-parser');
const session = require('express-session');
const sqlite3 = require('sqlite3');
const requestIp = require('request-ip');
const ipfilter = require('express-ipfilter').IpFilter

// app.use(session({secret: 'ssshhhhh'}));
var sess;
var databaseNrEntries;
const app = express();

const port = 6789;

// directorul 'views' va conține fișierele .ejs (html + js executat la server)
app.set('view engine', 'ejs');
// suport pentru layout-uri - implicit fișierul care reprezintă template-ul site-ului este views/layout.ejs
app.use(expressLayouts);
// directorul 'public' va conține toate resursele accesibile direct de către client (e.g., fișiere css, javascript, imagini)
app.use(express.static('public'))
// corpul mesajului poate fi interpretat ca json; datele de la formular se găsesc în format json în req.body
app.use(bodyParser.json());
// utilizarea unui algoritm de deep parsing care suportă obiecte în obiecte
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser())
app.use(session({secret: 'ssshhhhh'}))
// app.use(function(req, res){
//     if(req.session.blockedIp != null)
//         ipfilter(req.session.blockedIp, { mode: 'deny' })
// })
// la accesarea din browser adresei http://localhost:6789/ se va returna textul 'Hello World'
// proprietățile obiectului Request - req - https://expressjs.com/en/api.html#req
// proprietățile obiectului Response - res - https://expressjs.com/en/api.html#res
//am nevoie de type in json care poate fi user sau admin
//de fiecare data cand un utilizator face un request pentru o resursa, iar response-ul e 404 (resursa inexistenta)
//incrementez counter-ul din sesiune. Cand trece de o anumita valoare, adaug in cookie la blockedIp, ip-ul user-ului
//si setez durata de viata a cookie-ului cateva minute
//counter pt incercari nereusite in sesiune. cookie pt blockedLogin
//injection???

function checkBlacklist(req, res) {
    let clientIp = requestIp.getClientIp(req);
    //console.log(clientIp)
    if(req.session.blockedIp != null){
        if(req.session.blockedIp.includes(clientIp)){
            res.render('eroare-resurse')
            return true
        }
    }
    return false
}
app.get('/', (req, res) => {
    checkBlacklist(req, res)
    let db = new sqlite3.Database('./cumparaturi.db', (err) => {
        if(err) {
            return console.log(err.message);
        }
        //  console.log("Conectare reusita!")
    });
    db.all(`SELECT * FROM produse`, (err, data) => {
        if(err) {
            return console.log(err.message); 
        }
        // console.log(data);
        databaseNrEntries = data.length
        // console.log(databaseNrEntries)
        res.render('index', {u: req.session.username, data: data, type: req.session.type})
        
    })
})
    
const fs = require('fs');   
const { redirect } = require('express/lib/response');
const { ClientRequest } = require('http');
const { response } = require('express');
const e = require('express');
const { exit } = require('process');

app.get('/chestionar', (req, res) => {
    if(!checkBlacklist(req, res)){
            fs.readFile('intrebari.json', (err, data) => {
                if (err) throw err;
                let intrebari = JSON.parse(data);
            // în fișierul views/chestionar.ejs este accesibilă variabila 'intrebari' care conține vectorul de întrebări
                res.render('chestionar', {intrebari: intrebari});
            })
    }
});
app.post('/rezultat-chestionar', (req, res) => {
    if(!checkBlacklist(req, res)){
        fs.readFile('intrebari.json', (err, data) => {
            if (err) throw err;
            let intrebari = JSON.parse(data);
            var punctaj = 0
            for(let i in intrebari){
                if(req.body[`q${i}`] == intrebari[i].corect)
                    punctaj++;
            }
            res.render('rezultat-chestionar', {punctaj: punctaj});
            // console.log(punctaj)
        })
    }
}); 
app.get('/autentificare', (req, res) => {
    // res.clearCookie("mesajEroare")
    // if(req.cookies.utilizator == null)index
    //     res.render('autentificare', {m: req.cookies.mesajEroare})
    // res.redirect('/')
    if(!checkBlacklist(req, res)){
        sess = req.session;
        // console.log("timestamp " + sess.blockedTimestamp)
        let currentDate = Date.now()
        // console.log("current date " + currentDate)
        //|| sess.blockedTimestamp + 30000 < currentDate
        // console.log(sess.dictTimestamp)
        if(sess.dictTimestamp == null ){
            if(sess.username != null){
                res.redirect('/')
                return
            }
            else{
                res.render('autentificare', {e: req.session.errorMsg})
                return
            }
        }
        else{
            // console.log('aici')
            let clientIp = requestIp.getClientIp(req)
            for(i in sess.dictTimestamp){
                if(sess.dictTimestamp[i][0] == clientIp){
                    var index = i
                }
            }
            if(sess.dictTimestamp[index][1] + 30000 < currentDate){
                if(sess.username != null){
                    res.redirect('/')
                    return
                }
                else{
                    res.render('autentificare', {e: req.session.errorMsg})
                    return
                }
            }
            res.render('autentificare-esuata')
        }
        
    }
})

let rawdata = fs.readFileSync('utilizatori.json');
let utilizatori = JSON.parse(rawdata);
app.post('/verificare-autentificare', (request, response) => {
    //console.log(utilizatori)
    let username = request.body.username;
	let password = request.body.password;
    for(let i in utilizatori){
        if(username == utilizatori[i].utilizator && password == utilizatori[i].parola){
            sess.loginErrorCnt = 0
            sess = request.session;
            sess.username = username;
            sess.lastName = utilizatori[i].nume;
            sess.firstName = utilizatori[i].prenume;
            sess.type = utilizatori[i].tip;
            sess.dictCounter = null
            sess.dictTimestamp = null
            // response.cookie('utilizator', 'delia')
            response.redirect('/')
            return //de ce fara asta imi executa codul de dupa redirect??
        }
    }
    sess = request.session
    sess.errorMsg = "Utilizator sau parola gresite!"
    let clientIp = requestIp.getClientIp(request)
    if(sess.dictCounter == null){ // caz in care nu am nimic in dictionatul de ip - counter
        sess.dictCounter = []
        var pair = [clientIp, 1]
        sess.dictCounter.push(pair)
    }
    else{
        // console.log("asa")
        for(let i in sess.dictCounter){
            console.log(sess.dictCounter[i][0])
            if(sess.dictCounter[i][0] == clientIp){
                var myIndex = i
                // console.log("aici")
            }
        }
        if(myIndex != null){ //caz in care ip ul are un failed login
            sess.dictCounter[myIndex][1] ++
        }
        else{ // caz in care ip ul nu are niciun failed login
            pair = [clientIp, 1]
            sess.dictCounter.push(pair)
        }
        if(sess.dictCounter[myIndex][1] > 3){ // caz in care utilizatorul are mai mult de 3 failed logins
            if(sess.dictTimestamp == null){ //caz in care nu exista dictionarul ip - timestampBlocat
                sess.dictTimestamp = []
                pair = [clientIp, Date.now()]
                sess.dictTimestamp.push(pair)
            }
            else{
                for(i in sess.dictTimestamp){
                    if(sess.dictTimestamp[i][0] == clientIp){
                        var bIndex = i //fa cu break
                    }
                }
                if(bIndex != null){//caz in care ip ul a fost blocat
                    console.log("aaa")
                    sess.dictTimestamp[bIndex][1] += 30000
                }
                else{ //ip ul nu a fost blocat
                    console.log("bb")
                    pair = [clientIp, Date.now()]
                    sess.dictTimestamp.push(pair)
                }
            }
        }    
    }
    // console.log(sess.dictCounter)
    // console.log(sess.dictTimestamp)
    response.redirect('/autentificare')
    

});
app.get('/logout', (req, res) => {
    if(!checkBlacklist(req, res)){
        req.session.destroy((err) => {
            if(err) {
                return console.log(err);
            }
            res.redirect('/');
        });
    }
})
app.get('/creare-bd', (req, res) => {
    new sqlite3.Database('./cumparaturi.db', sqlite3.OPEN_READWRITE, (err) => {
        if (err && err.code == "SQLITE_CANTOPEN") {
            createDatabase();
        } 
        else if (err) {
            console.log(err);
            exit(1);
        }
        res.redirect('/');
    });
})
function createDatabase() {
    var newdb = new sqlite3.Database('cumparaturi.db', (err) => {
        if (err) {
            console.log(err);
            exit(1);
        }
        console.log("Baza de date creata!")
        createTables(newdb);
    });
}
function createTables(newdb) {
    newdb.run("CREATE TABLE produse (id_produs PRIMARY KEY NOT NULL, nume_produs TEXT NOT NULL UNIQUE, pret REAL NOT NULL)", function(createResult){
        if(createResult) 
            throw createResult;
    });
    console.log("Tabela creata!")
}
app.get('/inserare-bd', (req, res) => {
    let db = new sqlite3.Database('./cumparaturi.db', (err) => {
        if(err) {
            return console.log(err.message);
        }
        //console.log("Conectare reusita!")
    });
    db.run(`INSERT INTO produse(id_produs, nume_produs, pret) VALUES (1, 'Semințe de dovleac', 20.5), (2, 'Unt de arahide', 21.5), 
    (3, 'Lapte de cocos', 49.63), (4, 'Fulgi de ovăz', 15), (5, 'Baton cu nuca', 9.7)`, (err) => {
        if(err) {
            return console.log(err.message); 
        }
        console.log('Adaugarea s-a realizat cu succes!');
    })
    res.redirect('/');
})
app.post('/adaugare-cos', (request, response) => {
    checkBlacklist(request, response)
    let id = request.body.id
    sess = request.session
    sess.productArray = sess.productArray || []; 
    sess.productArray.push(id)
    // console.log(sess.productArray)
    response.redirect('/')
});
app.get('/vizualizare-cos', (request, response) => {
    if(!checkBlacklist(request, response)){
        // console.log(databaseNrEntries)
        var productsId
        var numberOfProducts = []
        for(let i = 0; i < databaseNrEntries; i++){
            numberOfProducts[i] = 0
        }
        // console.log(numberOfProducts)
        let db = new sqlite3.Database('./cumparaturi.db', (err) => {
            if(err) {
                return console.log(err.message);
            }
        });
        for(i in request.session.productArray)
        {
            if(i == 0){
                productsId = request.session.productArray[i]
            }
            if(i > 0 && i < request.session.productArray.length ){
                productsId += " OR id_produs = " + request.session.productArray[i]
            }
            numberOfProducts[request.session.productArray[i] - 1] ++;
        }
    // console.log(productsId)
    // console.log(numberOfProducts)
        db.all(`SELECT * FROM produse WHERE id_produs = ` + productsId, (err, data) => {
            if(err) {
                response.render('vizualizare-cos', {productArray: [], numberOfProducts: numberOfProducts})
                return console.log(err.message); 
            }
            response.render('vizualizare-cos', {productArray: data, numberOfProducts: numberOfProducts})
            // console.log(data)
        })
    }
    // }
    // response.render('vizualizare-cos', {productArray: productsId})
});
app.get('/admin', (request, response) => {
    checkBlacklist(request, response)
    if(request.session.type == "admin"){
        response.render('admin')
    }
    else{
        response.redirect('/')
    }
});
app.post('/inserare-produs', (req, res) => {
    checkBlacklist(req, res)
    let productName = req.body.name
    let productPrice = req.body.price
    let db = new sqlite3.Database('./cumparaturi.db', (err) => {
        if(err) {
            return console.log(err.message);
        }
        //console.log("Conectare reusita!")
    });
    db.all(`SELECT MAX(id_produs) AS maxID FROM produse`, (err, data) => {
        if(err) {
            return console.log(err.message); 
        }
        let maxId = data[0].maxID
        db.run(`INSERT INTO produse(id_produs, nume_produs, pret) VALUES (?, ?, ?)`, [maxId + 1, productName, productPrice], (err) => {
            if(err) {
                return console.log(err.message); 
            }
            // console.log('Adaugarea s-a realizat cu succes!');
        })
    })
    res.redirect('/')
});
app.use(function(req, res) {
    res.status(404);
    if(res.statusCode == 404){
        if(req.session.accessCounter == null){
            req.session.accessCounter = 1
        }
        else{
            req.session.accessCounter ++
        }
    }
    // console.log(req.session.accessCounter)
    if(req.session.accessCounter > 5){
        req.session.blockedIp = req.session.blockedIp || []; 
        let clientIp = requestIp.getClientIp(req);
        // console.log(clientIp);
        if(!req.session.blockedIp.includes(clientIp)){
            req.session.blockedIp.push(clientIp)
            // console.log(req.session.blockedIp)
        }
    }
    res.render('eroare-404')
    return
});

app.listen(port, () => console.log(`Serverul rulează la adresa http://localhost:`));