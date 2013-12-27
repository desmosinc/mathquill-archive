/**********************************
 * Symbols and Special Characters
 *********************************/

function makeVariable (ch, html) {
  return P(Variable, {
    ctrlSeq: ch,
    htmlTemplate: '<var>'+(html || ch)+'</var>',
    textTemplate: ch,
    DOMTemplate: function () {
      return crel('var', html || ch);
    }
  });
}
var Variable = P(Symbol, function(_, _super) {

  _.DOMTemplate = function () {
    return crel('var', this.ctrlSeq);
  };

  _.createBefore = function(cursor) {
    //want the longest possible autocommand, so assemble longest series of letters (Variables) first
    var ctrlSeq = this.ctrlSeq;
    for (var i = 0, prev = cursor.prev; i < MAX_AUTOCMD_LEN - 1 && prev && prev instanceof Variable; i += 1, prev = prev.prev)
      ctrlSeq = prev.ctrlSeq + ctrlSeq;
    //then test if there's an autocommand here, starting with the longest possible and slicing
    while (ctrlSeq.length) {
      if (AutoCmds.hasOwnProperty(ctrlSeq)) {
        for (var i = 1; i < ctrlSeq.length; i += 1) cursor.backspace();
        cursor.insertNew(LatexCmds[ctrlSeq](ctrlSeq));
        return;
      }
      ctrlSeq = ctrlSeq.slice(1);
    }
    _super.createBefore.apply(this, arguments);
  };
  _.respace =
  _.finalizeTree = function() {
    //TODO: in better architecture, should be done in createBefore and backspace
    //respace is called too often, inefficient

    //want the longest possible autocommand, so assemble longest series of letters (Variables)
    var ctrlSeq = this.ctrlSeq;
    if (ctrlSeq.length > 1) return;
    for (var prev = this.prev; prev instanceof Variable && prev.ctrlSeq.length === 1; prev = prev.prev)
      ctrlSeq = prev.ctrlSeq + ctrlSeq;
    for (var next = this.next; next instanceof Variable && next.ctrlSeq.length === 1; next = next.next)
      ctrlSeq += next.ctrlSeq;

    //removeClass from all the things before figuring out what's an autocmd, if any
    MathFragment(prev.next || this.parent.firstChild, next.prev || this.parent.lastChild)
    .each(function(el) {
      el.jQ.removeClass('mq-un-italicized mq-last');
      delete el.isFirstLetter;
      delete el.isLastLetter;
    });

    //test if there's an autocommand here, going through substrings from longest to shortest
    outer: for (var i = 0, first = prev.next || this.parent.firstChild; i < ctrlSeq.length; i += 1, first = first.next) {
      for (var len = min(MAX_UNITALICIZED_LEN, ctrlSeq.length - i); len > 0; len -= 1) {
        if (UnItalicizedCmds.hasOwnProperty(ctrlSeq.slice(i, i + len))) {
          first.isFirstLetter = true;
          for (var j = 0, letter = first; j < len; j += 1, letter = letter.next) {
            letter.jQ.addClass('mq-un-italicized');
            var last = letter;
          }
          last.isLastLetter = true;
          if (!(last.next instanceof SupSub || last.next instanceof Bracket))
            last.jQ.addClass('mq-last');
          i += len - 1;
          first = last;
          continue outer;
        }
      }
    }
  };
  _.latex = function() {
    return (
      this.isFirstLetter ? '\\' + this.ctrlSeq :
      this.isLastLetter ? this.ctrlSeq + ' ' :
      this.ctrlSeq
    );
  };
  _.text = function() {
    var text = this.ctrlSeq;
    if (this.prev && !(this.prev instanceof Variable)
        && !(this.prev instanceof BinaryOperator))
      text = '*' + text;
    if (this.next && !(this.next instanceof BinaryOperator)
        && !(this.next.ctrlSeq === '^'))
      text += '*';
    return text;
  };
});

var UnItalicized = P(Symbol, function(_, _super) {
  _.createBefore = function(cursor) {
    cursor.writeLatex(this.ctrlSeq).show();
  };
  _.parser = function() {
    var fn = this.ctrlSeq;
    var block = MathBlock();
    for (var i = 0; i < fn.length; i += 1) {
      Variable(fn.charAt(i)).adopt(block, block.lastChild, 0);
    }
    return Parser.succeed(block.children());
  };
});

//backslashless commands, words where adjacent letters (Variables)
//that form them automatically are turned into commands
var UnItalicizedCmds = {
  mean: 1,
  ln: 1,
  log: 1,
  min: 1,
  nCr: 1,
  nPr: 1,
  gcd: 1,
  lcm: 1,
  mcm: 1,
  mcd: 1,
  ceil: 1,
  exp: 1,
  abs: 1,
  max: 1,
  mod: 1,
  gcf: 1,
  exp: 1,
  floor: 1,
  sign: 1,
  signum: 1,
  round: 1
}, MAX_UNITALICIZED_LEN = 9, AutoCmds = {
  sqrt: 1,
  nthroot: 1,
  sum: 1,
  prod: 1,
  pi: 1,
  phi: 1,
  tau: 1,
  gamma: 1,
  theta: 1/*,
  int: 1*/
}, MAX_AUTOCMD_LEN = 7;

(function() {
  var trigs = { sin: 1, cos: 1, tan: 1, sec: 1, cosec: 1, csc: 1, cotan: 1, cot: 1, ctg: 1 };
  for (var trig in trigs) {
    UnItalicizedCmds[trig] =
    UnItalicizedCmds['arc'+trig] =
    UnItalicizedCmds[trig+'h'] =
    UnItalicizedCmds['arc'+trig+'h'] = 1;
  }

  for (var fn in UnItalicizedCmds)
    LatexCmds[fn] = UnItalicized;
}());

var VanillaSymbol = P(Symbol, {});

function makeVanillaSymbol(ch, html) {
  return P(VanillaSymbol, {
    ctrlSeq: ch,
    htmlTemplate: '<span>'+(html || ch)+'</span>',
    textTemplate: ch,
    DOMTemplate: function () {
      return crel('span', html || ch);
    }
  })
}

CharCmds[' '] = makeVanillaSymbol('\\space ', ' ');

LatexCmds.prime = CharCmds["'"] = makeVanillaSymbol("'", '\u2032');

// does not use Symbola font
var NonSymbolaSymbol = P(Symbol, {});

function makeNonSymbolaSymbol(ch, html) {
  return P(NonSymbolaSymbol, {
    ctrlSeq: ch,
    htmlTemplate: '<span class="mq-nonSymbola">'+(html || ch)+'</span>',
    textTemplate: ch,
    DOMTemplate: function () {
      return crel('span', {class: 'mq-nonSymbola'}, html || ch);
    }
  });
};

LatexCmds['@'] = NonSymbolaSymbol;
LatexCmds['&'] = makeNonSymbolaSymbol('\\&', '\u0026');
LatexCmds['%'] = makeNonSymbolaSymbol('\\%', '%');

//the following are all Greek to me, but this helped a lot: http://www.ams.org/STIX/ion/stixsig03.html

//lowercase Greek letter variables
LatexCmds.alpha = makeVariable('\\alpha ', '\u03B1');
LatexCmds.beta = makeVariable('\\beta ', '\u03B2');
LatexCmds.gamma = makeVariable('\\gamma ', '\u03B3');
LatexCmds.delta = makeVariable('\\delta ', '\u03B4');
LatexCmds.zeta = makeVariable('\\zeta ', '\u03B6');
LatexCmds.eta = makeVariable('\\eta ', '\u03B7');
LatexCmds.theta = makeVariable('\\theta ', '\u03B8');
LatexCmds.iota = makeVariable('\\iota ', '\u03B9');
LatexCmds.kappa = makeVariable('\\kappa ', '\u03BA');
LatexCmds.mu = makeVariable('\\mu ', '\u03BC');
LatexCmds.nu = makeVariable('\\nu ', '\u03BD');
LatexCmds.xi = makeVariable('\\xi ', '\u03BE');
LatexCmds.rho = makeVariable('\\rho ', '\u03C1');
LatexCmds.sigma = makeVariable('\\sigma ', '\u03C3');
LatexCmds.tau = makeVariable('\\tau ', '\u03C4');
LatexCmds.chi = makeVariable('\\chi ', '\u03C7');
LatexCmds.psi = makeVariable('\\psi ', '\u03C8');
LatexCmds.omega = makeVariable('\\omega ', '\u03C9');

//why can't anybody FUCKING agree on these
LatexCmds.phi = //W3C or Unicode?
  makeVariable('\\phi ','&#981;');

LatexCmds.phiv = //Elsevier and 9573-13
LatexCmds.varphi = //AMS and LaTeX
  makeVariable('\\varphi ','\u03C6');

LatexCmds.epsilon = //W3C or Unicode?
  makeVariable('\\epsilon ','&#1013;');

LatexCmds.epsiv = //Elsevier and 9573-13
LatexCmds.varepsilon = //AMS and LaTeX
  makeVariable('\\varepsilon ','\u03B5');

LatexCmds.piv = //W3C/Unicode and Elsevier and 9573-13
LatexCmds.varpi = //AMS and LaTeX
  makeVariable('\\varpi ','\u03D6');

LatexCmds.sigmaf = //W3C/Unicode
LatexCmds.sigmav = //Elsevier
LatexCmds.varsigma = //LaTeX
  makeVariable('\\varsigma ','\u03C2');

LatexCmds.thetav = //Elsevier and 9573-13
LatexCmds.vartheta = //AMS and LaTeX
LatexCmds.thetasym = //W3C/Unicode
  makeVariable('\\vartheta ','\u03D1');

LatexCmds.upsilon = //AMS and LaTeX and W3C/Unicode
LatexCmds.upsi = //Elsevier and 9573-13
  makeVariable('\\upsilon ','\u03C5');

//these aren't even mentioned in the HTML character entity references
LatexCmds.gammad = //Elsevier
LatexCmds.Gammad = //9573-13 -- WTF, right? I dunno if this was a typo in the reference (see above)
LatexCmds.digamma = //LaTeX
  makeVariable('\\digamma ','&#989;');

LatexCmds.kappav = //Elsevier
LatexCmds.varkappa = //AMS and LaTeX
  makeVariable('\\varkappa ','&#1008;');

LatexCmds.rhov = //Elsevier and 9573-13
LatexCmds.varrho = //AMS and LaTeX
  makeVariable('\\varrho ','&#1009;');

//Greek constants, look best in un-italicised Times New Roman
LatexCmds.pi = LatexCmds['\u03C0'] = makeNonSymbolaSymbol('\\pi ', '\u03C0');
LatexCmds.theta = LatexCmds['\u03B8'] = makeNonSymbolaSymbol('\\theta ','\u03B8');
LatexCmds.lambda = makeNonSymbolaSymbol('\\lambda ','\u03BB');

//uppercase greek letters

LatexCmds.Upsilon = //LaTeX
LatexCmds.Upsi = //Elsevier and 9573-13
LatexCmds.upsih = //W3C/Unicode "upsilon with hook"
LatexCmds.Upsih = //'cos it makes sense to me
  bind(Symbol,'\\Upsilon ','<var style="font-family: serif">\u03D2</var>'); //Symbola's 'upsilon with a hook' is a capital Y without hooks :(

//other symbols with the same LaTeX command and HTML character entity reference
LatexCmds.Gamma = makeVariable('\\Gamma', '\u0393');
LatexCmds.Delta = makeVariable('\\Delta', '\u0394');
LatexCmds.Theta = makeVariable('\\Theta', '\u0398');
LatexCmds.Lambda = makeVariable('\\Lambda', '\u039B');
LatexCmds.Xi = makeVariable('\\Xi', '\u039E');
LatexCmds.Pi = makeVariable('\\Pi', '\u03A0');
LatexCmds.Sigma = makeVariable('\\Sigma', '\u03A3');
LatexCmds.Phi = makeVariable('\\Phi', '\u03A6');
LatexCmds.Psi = makeVariable('\\Psi', '\u03A8');
LatexCmds.Omega = makeVariable('\\Omega', '\u03A9');

// symbols that aren't a single MathCommand, but are instead a whole
// Fragment. Creates the Fragment from a LaTeX string
var LatexFragment = P(MathCommand, function(_) {
  _.init = function(latex) { this.latex = latex; };
  _.createBefore = function(cursor) { cursor.writeLatex(this.latex); };
  _.parser = function() {
    var frag = latexMathParser.parse(this.latex).children();
    return Parser.succeed(frag);
  };
});

// for what seems to me like [stupid reasons][1], Unicode provides
// subscripted and superscripted versions of all ten Arabic numerals,
// as well as [so-called "vulgar fractions"][2].
// Nobody really cares about most of them, but some of them actually
// predate Unicode, dating back to [ISO-8859-1][3], apparently also
// known as "Latin-1", which among other things [Windows-1252][4]
// largely coincides with, so Microsoft Word sometimes inserts them
// and they get copy-pasted into MathQuill.
//
// (Irrelevant but funny story: Windows-1252 is actually a strict
// superset of the "closely related but distinct"[3] "ISO 8859-1" --
// see the lack of a dash after "ISO"? Completely different character
// set, like elephants vs elephant seals, or "Zombies" vs "Zombie
// Redneck Torture Family". What kind of idiot would get them confused.
// People in fact got them confused so much, it was so common to
// mislabel Windows-1252 text as ISO-8859-1, that most modern web
// browsers and email clients treat the MIME charset of ISO-8859-1
// as actually Windows-1252, behavior now standard in the HTML5 spec.)
//
// [1]: http://en.wikipedia.org/wiki/Unicode_subscripts_and_superscripts
// [2]: http://en.wikipedia.org/wiki/Number_Forms
// [3]: http://en.wikipedia.org/wiki/ISO/IEC_8859-1
// [4]: http://en.wikipedia.org/wiki/Windows-1252
LatexCmds['\u00b9'] = bind(LatexFragment, '^1');
LatexCmds['\u00b2'] = bind(LatexFragment, '^2');
LatexCmds['\u00b3'] = bind(LatexFragment, '^3');
LatexCmds['\u00bc'] = bind(LatexFragment, '\\frac14');
LatexCmds['\u00bd'] = bind(LatexFragment, '\\frac12');
LatexCmds['\u00be'] = bind(LatexFragment, '\\frac34');
LatexCmds['\u2152'] = bind(LatexFragment, '\\frac{1}{10}');
LatexCmds['\u2153'] = bind(LatexFragment, '\\frac13');
LatexCmds['\u2154'] = bind(LatexFragment, '\\frac23');


var BinaryOperator = P(Symbol, function(_, _super) {
  _.createBefore = function(cursor) {
    var ctrlSeq = cursor.prev.ctrlSeq + this.ctrlSeq;
    if (ctrlSeq === '<=')
      cursor.backspace().insertNew(BinaryOperator('\\le ', '\u2264'));
    else if (ctrlSeq === '>=')
      cursor.backspace().insertNew(BinaryOperator('\\ge ', '\u2265'));
    else
      _super.createBefore.apply(this, arguments);
  };
});

function binaryOperatorProperties(ctrlSeq, html, text) {
  return {
    ctrlSeq: ctrlSeq,
    htmlTemplate: '<span class="mq-binary-operator">'+html+'</span>',
    textTemplate: text,
    DOMTemplate: function () {
      return crel('span', {class: 'mq-binary-operator'}, html);
    }
  };
}

function makeBinaryOperator() {
  return P(BinaryOperator, binaryOperatorProperties.apply(null, arguments));
};

var PlusMinus = P(BinaryOperator, function(_) {
  _.respace = function() {
    if (!this.prev) {
      this.jQ[0].className = '';
    }
    else if (
      this.prev instanceof BinaryOperator &&
      this.next && !(this.next instanceof BinaryOperator)
    ) {
      this.jQ[0].className = 'mq-unary-operator';
    }
    else {
      this.jQ[0].className = 'mq-binary-operator';
    }
    return this;
  };
});

var makePlusMinus = function () {
  return P(PlusMinus, binaryOperatorProperties.apply(null, arguments));
};

LatexCmds['+'] = makePlusMinus('+', '+');
//yes, these are different dashes, I think one is an en dash and the other is a hyphen
LatexCmds['\u2013'] = LatexCmds['\u2212'] = LatexCmds['-'] = makePlusMinus('-', '\u2212');
LatexCmds['\u00B1'] = LatexCmds.pm = LatexCmds.plusmn = LatexCmds.plusminus =
  makePlusMinus('\\pm ','\u00B1');
LatexCmds.mp = LatexCmds.mnplus = LatexCmds.minusplus =
  makePlusMinus('\\mp ','&#8723;');

CharCmds['*'] = LatexCmds.sdot = LatexCmds.cdot =
  makeBinaryOperator('\\cdot ', '\u00B7');
//semantically should be \u22C5, but \u00B7 looks better

LatexCmds['='] = makeBinaryOperator('=', '=');
LatexCmds['<'] = makeBinaryOperator('<', '\u003C');
LatexCmds['>'] = makeBinaryOperator('>', '\u003E');

LatexCmds.notin = makeBinaryOperator('\\notin', '\u2209');
LatexCmds.sim = makeBinaryOperator('\\sim', '\u223C');
LatexCmds.cong = makeBinaryOperator('\\cong', '\u2245');
LatexCmds.equiv = makeBinaryOperator('\\equiv', '\u2261');
LatexCmds.oplus = makeBinaryOperator('\\oplus', '\u2295');
LatexCmds.otimes = makeBinaryOperator('\\otimes', '\u2297');

LatexCmds.times = makeBinaryOperator('\\times ', '\u00D7');

LatexCmds['\u00F7'] = LatexCmds.div = LatexCmds.divide = LatexCmds.divides =
  makeBinaryOperator('\\div ','\u00F7');

LatexCmds['\u2260'] = LatexCmds.ne = LatexCmds.neq = makeBinaryOperator('\\ne ','\u2260');

LatexCmds.ast = LatexCmds.star = LatexCmds.loast = LatexCmds.lowast =
  makeBinaryOperator('\\ast ','\u2217');
  //case 'there4 = // a special exception for this one, perhaps?
LatexCmds.therefor = LatexCmds.therefore =
  makeBinaryOperator('\\therefore ','\u2234');

LatexCmds.cuz = // l33t
LatexCmds.because = makeBinaryOperator('\\because ','&#8757;');

LatexCmds.prop = LatexCmds.propto = makeBinaryOperator('\\propto ','\u221D');

LatexCmds['\u2248'] = LatexCmds.asymp = LatexCmds.approx = makeBinaryOperator('\\approx ','\u2248');

LatexCmds.lt = makeBinaryOperator('<','\u003C');

LatexCmds.gt = makeBinaryOperator('>','\u003E');

LatexCmds['\u2264'] = LatexCmds.le = LatexCmds.leq = makeBinaryOperator('\\le ','\u2264');

LatexCmds['\u2265'] = LatexCmds.ge = LatexCmds.geq = makeBinaryOperator('\\ge ','\u2265');

LatexCmds.isin = LatexCmds['in'] = makeBinaryOperator('\\in ','\u2208');

LatexCmds.ni = LatexCmds.contains = makeBinaryOperator('\\ni ','\u220B');

LatexCmds.notni = LatexCmds.niton = LatexCmds.notcontains = LatexCmds.doesnotcontain =
  makeBinaryOperator('\\not\\ni ','&#8716;');

LatexCmds.sub = LatexCmds.subset = makeBinaryOperator('\\subset ','\u2282');

LatexCmds.sup = LatexCmds.supset = LatexCmds.superset =
  makeBinaryOperator('\\supset ','\u2283');

LatexCmds.nsub = LatexCmds.notsub =
LatexCmds.nsubset = LatexCmds.notsubset =
  makeBinaryOperator('\\not\\subset ','&#8836;');

LatexCmds.nsup = LatexCmds.notsup =
LatexCmds.nsupset = LatexCmds.notsupset =
LatexCmds.nsuperset = LatexCmds.notsuperset =
  makeBinaryOperator('\\not\\supset ','&#8837;');

LatexCmds.sube = LatexCmds.subeq = LatexCmds.subsete = LatexCmds.subseteq =
  makeBinaryOperator('\\subseteq ','\u2286');

LatexCmds.supe = LatexCmds.supeq =
LatexCmds.supsete = LatexCmds.supseteq =
LatexCmds.supersete = LatexCmds.superseteq =
  makeBinaryOperator('\\supseteq ','\u2287');

LatexCmds.nsube = LatexCmds.nsubeq =
LatexCmds.notsube = LatexCmds.notsubeq =
LatexCmds.nsubsete = LatexCmds.nsubseteq =
LatexCmds.notsubsete = LatexCmds.notsubseteq =
  makeBinaryOperator('\\not\\subseteq ','&#8840;');

LatexCmds.nsupe = LatexCmds.nsupeq =
LatexCmds.notsupe = LatexCmds.notsupeq =
LatexCmds.nsupsete = LatexCmds.nsupseteq =
LatexCmds.notsupsete = LatexCmds.notsupseteq =
LatexCmds.nsupersete = LatexCmds.nsuperseteq =
LatexCmds.notsupersete = LatexCmds.notsuperseteq =
  makeBinaryOperator('\\not\\supseteq ','&#8841;');

/*

//the canonical sets of numbers
LatexCmds.N = LatexCmds.naturals = LatexCmds.Naturals =
  makeVanillaSymbol('\\mathbb{N}','&#8469;');

LatexCmds.P =
LatexCmds.primes = LatexCmds.Primes =
LatexCmds.projective = LatexCmds.Projective =
LatexCmds.probability = LatexCmds.Probability =
  makeVanillaSymbol('\\mathbb{P}','&#8473;');

LatexCmds.Z = LatexCmds.integers = LatexCmds.Integers =
  makeVanillaSymbol('\\mathbb{Z}','&#8484;');

LatexCmds.Q = LatexCmds.rationals = LatexCmds.Rationals =
  makeVanillaSymbol('\\mathbb{Q}','&#8474;');

LatexCmds.R = LatexCmds.reals = LatexCmds.Reals =
  makeVanillaSymbol('\\mathbb{R}','&#8477;');

LatexCmds.C =
LatexCmds.complex = LatexCmds.Complex =
LatexCmds.complexes = LatexCmds.Complexes =
LatexCmds.complexplane = LatexCmds.Complexplane = LatexCmds.ComplexPlane =
  makeVanillaSymbol('\\mathbb{C}','&#8450;');

LatexCmds.H = LatexCmds.Hamiltonian = LatexCmds.quaternions = LatexCmds.Quaternions =
  makeVanillaSymbol('\\mathbb{H}','&#8461;');

//spacing
LatexCmds.quad = LatexCmds.emsp = makeVanillaSymbol('\\quad ','    ');
LatexCmds.qquad = makeVanillaSymbol('\\qquad ','        ');
spacing special characters, gonna have to implement this in LatexCommandInput::onText somehow
case ',':
  return VanillaSymbol('\\, ',' ');
case ':':
  return VanillaSymbol('\\: ','  ');
case ';':
  return VanillaSymbol('\\; ','   ');
case '!':
  return Symbol('\\! ','<span style="margin-right:-.2em"></span>');

//binary operators
LatexCmds.diamond = makeVanillaSymbol('\\diamond ', '&#9671;');
LatexCmds.bigtriangleup = makeVanillaSymbol('\\bigtriangleup ', '&#9651;');
LatexCmds.ominus = makeVanillaSymbol('\\ominus ', '&#8854;');
LatexCmds.uplus = makeVanillaSymbol('\\uplus ', '&#8846;');
LatexCmds.bigtriangledown = makeVanillaSymbol('\\bigtriangledown ', '&#9661;');
LatexCmds.sqcap = makeVanillaSymbol('\\sqcap ', '&#8851;');
LatexCmds.triangleleft = makeVanillaSymbol('\\triangleleft ', '&#8882;');
LatexCmds.sqcup = makeVanillaSymbol('\\sqcup ', '&#8852;');
LatexCmds.triangleright = makeVanillaSymbol('\\triangleright ', '&#8883;');
LatexCmds.odot = makeVanillaSymbol('\\odot ', '&#8857;');
LatexCmds.bigcirc = makeVanillaSymbol('\\bigcirc ', '&#9711;');
LatexCmds.dagger = makeVanillaSymbol('\\dagger ', '&#0134;');
LatexCmds.ddagger = makeVanillaSymbol('\\ddagger ', '&#135;');
LatexCmds.wr = makeVanillaSymbol('\\wr ', '&#8768;');
LatexCmds.amalg = makeVanillaSymbol('\\amalg ', '&#8720;');

//relationship symbols
LatexCmds.models = makeVanillaSymbol('\\models ', '&#8872;');
LatexCmds.prec = makeVanillaSymbol('\\prec ', '&#8826;');
LatexCmds.succ = makeVanillaSymbol('\\succ ', '&#8827;');
LatexCmds.preceq = makeVanillaSymbol('\\preceq ', '&#8828;');
LatexCmds.succeq = makeVanillaSymbol('\\succeq ', '&#8829;');
LatexCmds.simeq = makeVanillaSymbol('\\simeq ', '&#8771;');
LatexCmds.mid = makeVanillaSymbol('\\mid ', '&#8739;');
LatexCmds.ll = makeVanillaSymbol('\\ll ', '&#8810;');
LatexCmds.gg = makeVanillaSymbol('\\gg ', '&#8811;');
LatexCmds.parallel = makeVanillaSymbol('\\parallel ', '&#8741;');
LatexCmds.bowtie = makeVanillaSymbol('\\bowtie ', '&#8904;');
LatexCmds.sqsubset = makeVanillaSymbol('\\sqsubset ', '&#8847;');
LatexCmds.sqsupset = makeVanillaSymbol('\\sqsupset ', '&#8848;');
LatexCmds.smile = makeVanillaSymbol('\\smile ', '&#8995;');
LatexCmds.sqsubseteq = makeVanillaSymbol('\\sqsubseteq ', '&#8849;');
LatexCmds.sqsupseteq = makeVanillaSymbol('\\sqsupseteq ', '&#8850;');
LatexCmds.doteq = makeVanillaSymbol('\\doteq ', '&#8784;');
LatexCmds.frown = makeVanillaSymbol('\\frown ', '&#8994;');
LatexCmds.vdash = makeVanillaSymbol('\\vdash ', '&#8870;');
LatexCmds.dashv = makeVanillaSymbol('\\dashv ', '&#8867;');

//arrows
LatexCmds.longleftarrow = makeVanillaSymbol('\\longleftarrow ', '&#8592;');
LatexCmds.longrightarrow = makeVanillaSymbol('\\longrightarrow ', '&#8594;');
LatexCmds.Longleftarrow = makeVanillaSymbol('\\Longleftarrow ', '&#8656;');
LatexCmds.Longrightarrow = makeVanillaSymbol('\\Longrightarrow ', '&#8658;');
LatexCmds.longleftrightarrow = makeVanillaSymbol('\\longleftrightarrow ', '&#8596;');
LatexCmds.updownarrow = makeVanillaSymbol('\\updownarrow ', '&#8597;');
LatexCmds.Longleftrightarrow = makeVanillaSymbol('\\Longleftrightarrow ', '&#8660;');
LatexCmds.Updownarrow = makeVanillaSymbol('\\Updownarrow ', '&#8661;');
LatexCmds.mapsto = makeVanillaSymbol('\\mapsto ', '&#8614;');
LatexCmds.nearrow = makeVanillaSymbol('\\nearrow ', '&#8599;');
LatexCmds.hookleftarrow = makeVanillaSymbol('\\hookleftarrow ', '&#8617;');
LatexCmds.hookrightarrow = makeVanillaSymbol('\\hookrightarrow ', '&#8618;');
LatexCmds.searrow = makeVanillaSymbol('\\searrow ', '&#8600;');
LatexCmds.leftharpoonup = makeVanillaSymbol('\\leftharpoonup ', '&#8636;');
LatexCmds.rightharpoonup = makeVanillaSymbol('\\rightharpoonup ', '&#8640;');
LatexCmds.swarrow = makeVanillaSymbol('\\swarrow ', '&#8601;');
LatexCmds.leftharpoondown = makeVanillaSymbol('\\leftharpoondown ', '&#8637;');
LatexCmds.rightharpoondown = makeVanillaSymbol('\\rightharpoondown ', '&#8641;');
LatexCmds.nwarrow = makeVanillaSymbol('\\nwarrow ', '&#8598;');

//Misc
*/
LatexCmds.space = makeVanillaSymbol('\\space ', '\u00A0');
/*
LatexCmds.ldots = makeVanillaSymbol('\\ldots ', '&#8230;');
LatexCmds.cdots = makeVanillaSymbol('\\cdots ', '&#8943;');
LatexCmds.vdots = makeVanillaSymbol('\\vdots ', '&#8942;');
LatexCmds.ddots = makeVanillaSymbol('\\ddots ', '&#8944;');
LatexCmds.surd = makeVanillaSymbol('\\surd ', '&#8730;');
LatexCmds.triangle = makeVanillaSymbol('\\triangle ', '&#9653;');
LatexCmds.ell = makeVanillaSymbol('\\ell ', '&#8467;');
LatexCmds.top = makeVanillaSymbol('\\top ', '&#8868;');
LatexCmds.flat = makeVanillaSymbol('\\flat ', '&#9837;');
LatexCmds.natural = makeVanillaSymbol('\\natural ', '&#9838;');
LatexCmds.sharp = makeVanillaSymbol('\\sharp ', '&#9839;');
LatexCmds.wp = makeVanillaSymbol('\\wp ', '&#8472;');
LatexCmds.bot = makeVanillaSymbol('\\bot ', '&#8869;');
LatexCmds.clubsuit = makeVanillaSymbol('\\clubsuit ', '&#9827;');
LatexCmds.diamondsuit = makeVanillaSymbol('\\diamondsuit ', '&#9826;');
LatexCmds.heartsuit = makeVanillaSymbol('\\heartsuit ', '&#9825;');
LatexCmds.spadesuit = makeVanillaSymbol('\\spadesuit ', '&#9824;');

//variable-sized
LatexCmds.oint = makeVanillaSymbol('\\oint ', '&#8750;');
LatexCmds.bigcap = makeVanillaSymbol('\\bigcap ', '&#8745;');
LatexCmds.bigcup = makeVanillaSymbol('\\bigcup ', '&#8746;');
LatexCmds.bigsqcup = makeVanillaSymbol('\\bigsqcup ', '&#8852;');
LatexCmds.bigvee = makeVanillaSymbol('\\bigvee ', '&#8744;');
LatexCmds.bigwedge = makeVanillaSymbol('\\bigwedge ', '&#8743;');
LatexCmds.bigodot = makeVanillaSymbol('\\bigodot ', '&#8857;');
LatexCmds.bigotimes = makeVanillaSymbol('\\bigotimes ', '&#8855;');
LatexCmds.bigoplus = makeVanillaSymbol('\\bigoplus ', '&#8853;');
LatexCmds.biguplus = makeVanillaSymbol('\\biguplus ', '&#8846;');

//delimiters
LatexCmds.lfloor = makeVanillaSymbol('\\lfloor ', '&#8970;');
LatexCmds.rfloor = makeVanillaSymbol('\\rfloor ', '&#8971;');
LatexCmds.lceil = makeVanillaSymbol('\\lceil ', '&#8968;');
LatexCmds.rceil = makeVanillaSymbol('\\rceil ', '&#8969;');
LatexCmds.slash = makeVanillaSymbol('\\slash ', '&#47;');
LatexCmds.opencurlybrace = makeVanillaSymbol('\\opencurlybrace ', '&#123;');
LatexCmds.closecurlybrace = makeVanillaSymbol('\\closecurlybrace ', '&#125;');

//various symbols

LatexCmds.caret = makeVanillaSymbol('\\caret ','^');
LatexCmds.underscore = makeVanillaSymbol('\\underscore ','_');
LatexCmds.backslash = makeVanillaSymbol('\\backslash ','\\');
LatexCmds.vert = makeVanillaSymbol('|');
LatexCmds.perp = LatexCmds.perpendicular = makeVanillaSymbol('\\perp ','\u22A5');
LatexCmds.nabla = LatexCmds.del = makeVanillaSymbol('\\nabla ','\u2207');
LatexCmds.hbar = makeVanillaSymbol('\\hbar ','&#8463;');

LatexCmds.AA = LatexCmds.Angstrom = LatexCmds.angstrom =
  makeVanillaSymbol('\\text\\AA ','&#8491;');

LatexCmds.ring = LatexCmds.circ = LatexCmds.circle =
  makeVanillaSymbol('\\circ ','&#8728;');

LatexCmds.bull = LatexCmds.bullet = makeVanillaSymbol('\\bullet ','\u2022');

LatexCmds.setminus = LatexCmds.smallsetminus =
  makeVanillaSymbol('\\setminus ','&#8726;');

LatexCmds.not = //bind(Symbol,'\\not ','<span class="not">/</span>');
LatexCmds['¬'] = LatexCmds.neg = makeVanillaSymbol('\\neg ','\u00AC');

LatexCmds['…'] = LatexCmds.dots = LatexCmds.ellip = LatexCmds.hellip =
LatexCmds.ellipsis = LatexCmds.hellipsis =
  makeVanillaSymbol('\\dots ','\u2026');

LatexCmds.converges =
LatexCmds.darr = LatexCmds.dnarr = LatexCmds.dnarrow = LatexCmds.downarrow =
  makeVanillaSymbol('\\downarrow ','\u2193');

LatexCmds.dArr = LatexCmds.dnArr = LatexCmds.dnArrow = LatexCmds.Downarrow =
  makeVanillaSymbol('\\Downarrow ','\u21D3');

LatexCmds.diverges = LatexCmds.uarr = LatexCmds.uparrow =
  makeVanillaSymbol('\\uparrow ','\u2191');

LatexCmds.uArr = LatexCmds.Uparrow = makeVanillaSymbol('\\Uparrow ','\u21D1');

LatexCmds.to = makeBinaryOperator('\\to ','\u2192');

LatexCmds.rarr = LatexCmds.rightarrow = makeVanillaSymbol('\\rightarrow ','\u2192');

LatexCmds.implies = makeBinaryOperator('\\Rightarrow ','\u21D2');

LatexCmds.rArr = LatexCmds.Rightarrow = makeVanillaSymbol('\\Rightarrow ','\u21D2');

LatexCmds.gets = makeBinaryOperator('\\gets ','\u2190');

LatexCmds.larr = LatexCmds.leftarrow = makeVanillaSymbol('\\leftarrow ','\u2190');

LatexCmds.impliedby = makeBinaryOperator('\\Leftarrow ','\u21D0');

LatexCmds.lArr = LatexCmds.Leftarrow = makeVanillaSymbol('\\Leftarrow ','\u21D0');

LatexCmds.harr = LatexCmds.lrarr = LatexCmds.leftrightarrow =
  makeVanillaSymbol('\\leftrightarrow ','\u2194');

LatexCmds.iff = makeBinaryOperator('\\Leftrightarrow ','\u21D4');

LatexCmds.hArr = LatexCmds.lrArr = LatexCmds.Leftrightarrow =
  makeVanillaSymbol('\\Leftrightarrow ','\u21D4');

LatexCmds.Re = LatexCmds.Real = LatexCmds.real = makeVanillaSymbol('\\Re ','\u211C');

LatexCmds.Im = LatexCmds.imag =
LatexCmds.image = LatexCmds.imagin = LatexCmds.imaginary = LatexCmds.Imaginary =
  makeVanillaSymbol('\\Im ','\u2111');

LatexCmds.part = LatexCmds.partial = makeVanillaSymbol('\\partial ','\u2202');

LatexCmds.inf = LatexCmds.infin = LatexCmds.infty = LatexCmds.infinity =
  makeVanillaSymbol('\\infty ','\u221E');

LatexCmds.alef = LatexCmds.alefsym = LatexCmds.aleph = LatexCmds.alephsym =
  makeVanillaSymbol('\\aleph ','\u2135');

LatexCmds.xist = //LOL
LatexCmds.xists = LatexCmds.exist = LatexCmds.exists =
  makeVanillaSymbol('\\exists ','\u2203');
*/
LatexCmds.and = LatexCmds.land = LatexCmds.wedge =
  makeVanillaSymbol('\\wedge ','\u2227');

LatexCmds.or = LatexCmds.lor = LatexCmds.vee = makeVanillaSymbol('\\vee ','\u2228');
/*
LatexCmds.o = LatexCmds.O =
LatexCmds.empty = LatexCmds.emptyset =
LatexCmds.oslash = LatexCmds.Oslash =
LatexCmds.nothing = LatexCmds.varnothing =
  makeBinaryOperator('\\varnothing ','\u2205');

LatexCmds.cup = LatexCmds.union = makeBinaryOperator('\\cup ','\u222A');

LatexCmds.cap = LatexCmds.intersect = LatexCmds.intersection =
  makeBinaryOperator('\\cap ','\u2229');

LatexCmds.deg = LatexCmds.degree = makeVanillaSymbol('^\\circ ','\u00B0');

LatexCmds.ang = LatexCmds.angle = makeVanillaSymbol('\\angle ','\u2220');
*/
