/***************************
 * Commands and Operators.
 **************************/

var CharCmds = {}, LatexCmds = {}; //single character commands, LaTeX commands

var scale, // = function(jQ, x, y) { ... }
//will use a CSS 2D transform to scale the jQuery-wrapped HTML elements,
//or the filter matrix transform fallback for IE 5.5-8, or gracefully degrade to
//increasing the fontSize to match the vertical Y scaling factor.

//ideas from http://github.com/louisremi/jquery.transform.js
//see also http://msdn.microsoft.com/en-us/library/ms533014(v=vs.85).aspx

  forceIERedraw = noop,
  div = document.createElement('div'),
  div_style = div.style,
  transformPropNames = {
    transform:1,
    WebkitTransform:1,
    MozTransform:1,
    OTransform:1,
    msTransform:1
  },
  transformPropName;

for (var prop in transformPropNames) {
  if (prop in div_style) {
    transformPropName = prop;
    break;
  }
}

if (transformPropName) {
  scale = function(jQ, x, y) {
    jQ.css(transformPropName, 'scale('+x+','+y+')');
  };
}
else if ('filter' in div_style) { //IE 6, 7, & 8 fallback, see https://github.com/laughinghan/mathquill/wiki/Transforms
  forceIERedraw = function(el){ el.className = el.className; };
  scale = function(jQ, x, y) { //NOTE: assumes y > x
    x /= (1+(y-1)/2);
    jQ.css('fontSize', y + 'em');
    if (!jQ.hasClass('mq-matrixed-container')) {
      jQ.addClass('mq-matrixed-container')
      .wrapInner('<span class="mq-matrixed"></span>');
    }
    var innerjQ = jQ.children()
    .css('filter', 'progid:DXImageTransform.Microsoft'
        + '.Matrix(M11=' + x + ",SizingMethod='auto expand')"
    );
    function calculateMarginRight() {
      jQ.css('marginRight', (innerjQ.width()-1)*(x-1)/x + 'px');
    }
    calculateMarginRight();
    var intervalId = setInterval(calculateMarginRight);
    $(window).load(function() {
      clearTimeout(intervalId);
      calculateMarginRight();
    });
  };
}
else {
  scale = function(jQ, x, y) {
    jQ.css('fontSize', y + 'em');
  };
}

// `batchRedraw` is a performance optimization for the case of inserting many mathquills into the
// DOM at once. It executes the passed function, fn, deferring all DOM measurements until after the
// function has finished executing, and deferring all scaling until after the measurements are
// finished. This keeps the browser from having to perform a style recalculation and page layout
// for every call to scale.
//
// This procedure relies on calls to `scale` being wrapped in `batchCall`. The argument to batchCall
// is a function that performs a DOM measurement, and returns a function that will use that DOM
// measurement to do a rescaling. The nested function structure is necessary because calls to `scale`
// invalidate the layout (in Chrome anyway, as of Dec. 2013), so it's necessary to do all measuring
// in a first pass, and all scaling in a second pass. Note, this is only correct so long as calls to
// `scale` on an inner node don't affect the offsetHeight of an outer node.
//
// batchRedraw is exported as part of the public api. Usage is as follows:
//
// `$.fn.mathquill.batchRedraw(function () { /* insert a bunch of mathquills into the DOM */ });
var batchRedrawing = false;
var redrawQueue = [];
var batchRedraw = function (fn) {
  if (batchRedrawing) {fn(); return;}

  batchRedrawing = true;
  fn();
  for (var i = 0; i < redrawQueue.length; i++) redrawQueue[i] = redrawQueue[i]();
  for (var i = 0; i < redrawQueue.length; i++) redrawQueue[i]();
  batchRedrawing = false;
  redrawQueue = [];
};

var batchCall = function (fn) {
  if (batchRedrawing) {
    redrawQueue.push(fn);
  } else {
    fn()();
  }
};

var Style = P(MathCommand, {});

var makeStyle = function (ctrlSeq, tagName, classStr) {
  return P(Style, {
    ctrlSeq: ctrlSeq,
    tagName: tagName,
    htmlTemplate: '<'+tagName+' class="'+classStr+'">&0</'+tagName+'>',
    DOMTemplate: function (blocks) {
      return wrapBlock(crel(tagName, {class: classStr}), blocks[0]);
    }
  });
};

//fonts
LatexCmds.mathrm = makeStyle('\\mathrm', 'span', 'mq-roman mq-font');
LatexCmds.mathit = makeStyle('\\mathit', 'i', 'mq-font');
LatexCmds.mathbf = makeStyle('\\mathbf', 'b', 'mq-font');
LatexCmds.mathsf = makeStyle('\\mathsf', 'span', 'mq-sans-serif mq-font');
LatexCmds.mathtt = makeStyle('\\mathtt', 'span', 'mq-monospace mq-font');
//text-decoration
LatexCmds.underline = makeStyle('\\underline', 'span', 'mq-non-leaf mq-underline');
LatexCmds.overline = LatexCmds.bar = makeStyle('\\overline', 'span', 'mq-non-leaf mq-overline');

var SupSub = P(MathCommand, function(_, _super) {
  _.finalizeTree = function() {
    //TODO: use inheritance
    pray('SupSub is only _ and ^',
      this.ctrlSeq === '^' || this.ctrlSeq === '_'
    );

    if (this.ctrlSeq === '_') {
      this.down = this.firstChild;
      this.firstChild.up = insertBeforeUnlessAtEnd;
    }
    else {
      this.up = this.firstChild;
      this.firstChild.down = insertBeforeUnlessAtEnd;
    }
  };
  function insertBeforeUnlessAtEnd(cursor) {
    // cursor.insertBefore(cmd), unless cursor at the end of block, and every
    // ancestor cmd is at the end of every ancestor block
    var cmd = this.parent, ancestorCmd = cursor;
    do {
      if (ancestorCmd.next) {
        cursor.insertBefore(cmd);
        return false;
      }
      ancestorCmd = ancestorCmd.parent.parent;
    } while (ancestorCmd !== cmd);
    cursor.insertAfter(cmd);
    return false;
  }
  _.latex = function() {
    if (this.ctrlSeq === '_' && this.respaced) return '';

    var latex = '';

    if (this.ctrlSeq === '^' && this.next.respaced) {
      var block = this.next.firstChild.latex();
      if (block.length === 1) latex += '_' + block;
      else latex += '_{' + block + '}';
    }

    var block = this.firstChild.latex();
    if (block.length === 1) latex += this.ctrlSeq + block;
    else latex += this.ctrlSeq + '{' + (block || ' ') + '}';

    return latex;
  };
  _.redraw = function() {
    if (this.prev)
      this.prev.respace();
    //SupSub::respace recursively calls respace on all the following SupSubs
    //so if prev is a SupSub, no need to call respace on this or following nodes
    if (!(this.prev instanceof SupSub)) {
      this.respace();
      //and if next is a SupSub, then this.respace() will have already called
      //this.next.respace()
      if (this.next && !(this.next instanceof SupSub))
        this.next.respace();
    }
  };
  _.respace = function() {
    if (
      this.prev.ctrlSeq === '\\int ' || (
        this.prev instanceof SupSub && this.prev.ctrlSeq != this.ctrlSeq
        && this.prev.prev && this.prev.prev.ctrlSeq === '\\int '
      )
    ) {
      if (!this['int']) {
        this['int'] = true;
        this.jQ.addClass('mq-int');
      }
    }
    else {
      if (this['int']) {
        this['int'] = false;
        this.jQ.removeClass('mq-int');
      }
    }

    this.respaced = this.prev instanceof SupSub && this.prev.ctrlSeq != this.ctrlSeq && !this.prev.respaced;
    if (this.respaced) {
      var fontSize = +this.jQ.css('fontSize').slice(0,-2),
        prevWidth = this.prev.jQ.outerWidth(),
        thisWidth = this.jQ.outerWidth();
      this.jQ.css({
        left: (this['int'] && this.ctrlSeq === '_' ? -.25 : 0) - prevWidth/fontSize + 'em',
        marginRight: .1 - min(thisWidth, prevWidth)/fontSize + 'em'
          //1px extra so it doesn't wrap in retarded browsers (Firefox 2, I think)
      });
    }
    else if (this['int'] && this.ctrlSeq === '_') {
      this.jQ.css({
        left: '-.25em',
        marginRight: ''
      });
    }
    else {
      this.jQ.css({
        left: '',
        marginRight: ''
      });
    }

    if (this.respaced) {
      if (this.ctrlSeq === '^') this.down = this.firstChild.down = this.prev.firstChild;
      else this.up = this.firstChild.up = this.prev.firstChild;
    }
    else if (this.next.respaced) {
      if (this.ctrlSeq === '_') this.up = this.firstChild.up = this.next.firstChild;
      else this.down = this.firstChild.down = this.next.firstChild;
    }
    else {
      if (this.ctrlSeq === '_') {
        delete this.up;
        this.firstChild.up = insertBeforeUnlessAtEnd;
      }
      else {
        delete this.down;
        this.firstChild.down = insertBeforeUnlessAtEnd;
      }
    }

    if (this.next instanceof SupSub)
      this.next.respace();

    return this;
  };

  _.onKey = function(key, e) {
    if (this.getCursor().parent.parent !== this) return;

    switch (key) {
    case 'Tab':
      if (this.next.respaced) {
        this.getCursor().prepareMove().prependTo(this.next.firstChild);
        e.preventDefault();
        return false;
      }
      break;
    case 'Shift-Tab':
      if (this.respaced) {
        this.getCursor().prepareMove().appendTo(this.prev.firstChild);
        e.preventDefault();
        return false;
      }
      break;
    case 'Left':
      if (!this.getCursor().prev && this.respaced) {
        this.getCursor().prepareMove().insertBefore(this.prev);
        return false;
      }
      break;
    case 'Right':
      if (!this.getCursor().next && this.next.respaced) {
        this.getCursor().prepareMove().insertAfter(this.next);
        return false;
      }
    }
  };
  _.getCursor = function() {
    var cursor;
    for (var ancestor = this.parent; !cursor; ancestor = ancestor.parent) {
      cursor = ancestor.cursor;
    }
    this.getCursor = function() { return cursor; };
    return this.getCursor();
  };
  _.expectedCursorYNextTo = function(clientRect) {
    // superscripts and subscripts are vertical-align-ed +/- 0.5em, so
    // their bottom or top edge almost perfectly aligns with the
    // cursor's center
    if (this.ctrlSeq === '_') return clientRect(this).top;
    else return clientRect(this).bottom;
  };
});

function makeSupSub(ctrlSeq, tag, text) {
  return P(SupSub, {
    ctrlSeq: ctrlSeq,
    htmlTemplate: '<'+tag+' class="mq-non-leaf"><span class="mq-non-leaf mq-'+tag+'">&0</span></'+tag+'>',
    textTemplate: [ text ],
    DOMTemplate: function (blocks) {
      return crel(tag, {class: 'mq-non-leaf'},
        wrapBlock(crel('span', {class: 'mq-non-leaf mq-'+tag}), blocks[0])
      );
    }
  });
}

LatexCmds.subscript =
LatexCmds._ = makeSupSub('_', 'sub', '_');

LatexCmds.superscript =
LatexCmds.supscript =
LatexCmds['^'] = makeSupSub('^', 'sup', '**');

var BigSymbol = P(MathCommand, function(_, _super) {
  _.placeCursor = function(cursor) {
    cursor.appendTo(this.firstChild).writeLatex('n=').show();
  };
  _.latex = function() {
    function simplify(latex) {
      return latex.length === 1 ? latex : '{' + (latex || ' ') + '}';
    }
    return this.ctrlSeq + '_' + simplify(this.firstChild.latex()) +
      '^' + simplify(this.lastChild.latex());
  };
  _.parser = function() {
    var string = Parser.string;
    var optWhitespace = Parser.optWhitespace;
    var succeed = Parser.succeed;
    var block = latexMathParser.block;

    var self = this;
    var blocks = self.blocks = [ MathBlock(), MathBlock() ];
    for (var i = 0; i < blocks.length; i += 1) {
      blocks[i].adopt(self, self.lastChild, 0);
    }

    return optWhitespace.then(string('_').or(string('^'))).then(function(supOrSub) {
      var child = blocks[supOrSub === '_' ? 0 : 1];
      return block.then(function(block) {
        block.children().adopt(child, child.lastChild, 0);
        return succeed(self);
      });
    }).many().result(self);
  };
  _.finalizeTree = function() {
    this.down = this.firstChild;
    this.firstChild.up = insertAfterUnlessAtBeginning;
    this.up = this.lastChild;
    this.lastChild.down = insertAfterUnlessAtBeginning;
  };
  function insertAfterUnlessAtBeginning(cursor) {
    // cursor.insertAfter(cmd), unless cursor at the beginning of block, and every
    // ancestor cmd is at the beginning of every ancestor block
    var cmd = this.parent, ancestorCmd = cursor;
    do {
      if (ancestorCmd.prev) {
        cursor.insertAfter(cmd);
        return false;
      }
      ancestorCmd = ancestorCmd.parent.parent;
    } while (ancestorCmd !== cmd);
    cursor.insertBefore(cmd);
    return false;
  }
});

function makeBigSymbol(ch, html) {
  return P(BigSymbol, {
    ctrlSeq: ch,
    htmlTemplate: '<span class="mq-large-operator mq-non-leaf">'
      +   '<span class="mq-to"><span>&1</span></span>'
      +   '<big>'+html+'</big>'
      +   '<span class="mq-from"><span>&0</span></span>'
      + '</span>',
    DOMTemplate: function (blocks) {
      return crel('span', {class: 'mq-large-operator mq-non-leaf'},
        crel('span', {class: 'mq-to'}, wrapBlock(crel('span'), blocks[1])),
        crel('big', html),
        crel('span', {class: 'mq-from'}, wrapBlock(crel('span'), blocks[0]))
      );
    }
  });
};

LatexCmds['\u2211'] = LatexCmds.sum = LatexCmds.summation = makeBigSymbol('\\sum ','\u2211');
LatexCmds['\u220F'] = LatexCmds.prod = LatexCmds.product = makeBigSymbol('\\prod ','\u220F');

var Fraction =
LatexCmds.frac =
LatexCmds.dfrac =
LatexCmds.cfrac =
LatexCmds.fraction = P(MathCommand, function(_, _super) {
  _.ctrlSeq = '\\frac';
  _.htmlTemplate =
      '<span class="mq-fraction mq-non-leaf">'
    +   '<span class="mq-numerator">&0</span>'
    +   '<span class="mq-denominator">&1</span>'
    +   '<span style="display:inline-block;width:0;overflow:hidden">\u00A0</span>'
    + '</span>'
  ;
  _.DOMTemplate = function (blocks) {
    return crel('span', {class: 'mq-fraction mq-non-leaf'},
      wrapBlock(crel('span', {class: 'mq-numerator'}), blocks[0]),
      wrapBlock(crel('span', {class: 'mq-denominator'}), blocks[1]),
      crel('span', {style: 'display:inline-block;width:0;overflow:hidden'}, '\u00A0')
    );
  };
  _.textTemplate = ['(', '/', ')'];
  _.finalizeTree = function() {
    this.up = this.lastChild.up = this.firstChild;
    this.down = this.firstChild.down = this.lastChild;
  };
  _.expectedCursorYNextTo = function(clientRect) {
    // vertical-align-ed -0.5em, so the top edge of the span that sets
    // the baseline almost perfectly aligns with the cursor's center
    return clientRect.elById(this.jQ[0].lastChild, this.id+.5).top;
  };
});

var LiveFraction =
LatexCmds.over =
CharCmds['/'] = P(Fraction, function(_, _super) {
  _.createBefore = function(cursor) {
    if (!this.replacedFragment) {
      var prev = cursor.prev;
      if (prev instanceof TextBlock || prev instanceof Fraction) {
        prev = prev.prev;
      }
      else {
        while (prev &&
          !(
            prev instanceof BinaryOperator ||
            prev instanceof TextBlock ||
            prev instanceof BigSymbol ||
            prev instanceof Fraction ||
            prev.ctrlSeq === ',' ||
            prev.ctrlSeq === ':' ||
            prev.ctrlSeq === '\\space '
          ) //lookbehind for operator
        )
          prev = prev.prev;

        if (prev instanceof BigSymbol && prev.next instanceof SupSub) {
          prev = prev.next;
          if (prev.next instanceof SupSub && prev.next.ctrlSeq != prev.ctrlSeq)
            prev = prev.next;
        }
      }

      if (prev !== cursor.prev) {
        this.replaces(MathFragment(prev.next || cursor.parent.firstChild, cursor.prev));
        cursor.prev = prev;
      }
    }
    _super.createBefore.call(this, cursor);
  };
});

var SquareRoot =
LatexCmds.sqrt =
LatexCmds['√'] = P(MathCommand, function(_, _super) {
  _.ctrlSeq = '\\sqrt';
  _.htmlTemplate =
      '<span class="mq-non-leaf">'
    +   '<span class="mq-scaled mq-sqrt-prefix">\u221A</span>'
    +   '<span class="mq-non-leaf mq-sqrt-stem">&0</span>'
    + '</span>'
  ;
  _.DOMTemplate = function (blocks) {
    return crel('span', {class: 'mq-non-leaf'},
      crel('span', {class: 'mq-scaled mq-sqrt-prefix'}, '\u221A'),
      wrapBlock(crel('span', {class: 'mq-non-leaf mq-sqrt-stem'}), blocks[0])
    );
  };
  _.textTemplate = ['sqrt(', ')'];
  _.parser = function() {
    return latexMathParser.optBlock.then(function(optBlock) {
      return latexMathParser.block.map(function(block) {
        var nthroot = NthRoot();
        nthroot.blocks = [ optBlock, block ];
        optBlock.adopt(nthroot, 0, 0);
        block.adopt(nthroot, optBlock, 0);
        return nthroot;
      });
    }).or(_super.parser.call(this));
  };
  _.redraw = function() {
    var block = this.lastChild.jQ;

    batchCall(function () {
      var height = block.innerHeight()/+block.css('fontSize').slice(0,-2);
      return function () {scale(block.prev(), 1, height - .1);};
    });
  };
});


var NthRoot =
LatexCmds.nthroot = P(SquareRoot, function(_, _super) {
  _.htmlTemplate =
      '<sup class="mq-nthroot mq-non-leaf">&0</sup>'
    + '<span class="mq-scaled">'
    +   '<span class="mq-sqrt-prefix mq-scaled">\u221A</span>'
    +   '<span class="mq-sqrt-stem mq-non-leaf">&1</span>'
    + '</span>'
  ;
  _.DOMTemplate = function (blocks) {
    var frag = document.createDocumentFragment();
    frag.appendChild(wrapBlock(crel('span', {class: 'mq-nthroot mq-non-leaf'}), blocks[0]));
    frag.appendChild(crel('span', {class: 'mq-scaled'},
      crel('span', {class: 'mq-sqrt-prefix mq-scaled'}, '\u221A'),
      wrapBlock(crel('span', {class: 'mq-sqrt-stem mq-non-leaf'}), blocks[1])
    ));
    return frag;
  };
  _.textTemplate = ['sqrt[', '](', ')'];
  _.latex = function() {
    return '\\sqrt['+this.firstChild.latex()+']{'+this.lastChild.latex()+'}';
  };
  _.onKey = function(key, e) {
    if (this.getCursor().parent.parent !== this) return;

    switch (key) {
    case 'Right':
      if (this.getCursor().next) return;
    case 'Tab':
      if (this.getCursor().parent === this.firstChild) {
        this.getCursor().prepareMove().prependTo(this.lastChild);
        e.preventDefault();
        return false;
      }
      break;
    case 'Left':
      if (this.getCursor().prev) return;
    case 'Shift-Tab':
      if (this.getCursor().parent === this.lastChild) {
        this.getCursor().prepareMove().appendTo(this.firstChild);
        e.preventDefault();
        return false;
      }
    }
  };
  _.getCursor = SupSub.prototype.getCursor;
  _.expectedCursorYNextTo = function(clientRect) {
    // superscripts are vertical-align-ed 0.5em, so their bottom edge
    // almost perfectly aligns with the cursor's center
    return clientRect.elById(this.jQ[0], this.id+.5).bottom;
  };
});

// Round/Square/Curly/Angle Brackets (aka Parens/Brackets/Braces)
var Bracket = P(MathCommand, function(_, _super) {
  _.init = function () {
    _super.init.call(this);
    this.openEl = crel('span', {class: 'mq-scaled mq-paren'}, this.open);
    this.closeEl = crel('span', {class: 'mq-scaled mq-paren'}, this.close);
    this.bracketjQs = $([this.openEl, this.closeEl]);
  }
  //When typed, auto-expand paren to end of block
  _.finalizeTree = function() {
    if (this.firstChild.isEmpty() && this.next) {
      var nextAll = MathFragment(this.next, this.parent.lastChild).disown();
      nextAll.adopt(this.firstChild, 0, 0);
      nextAll.jQ.appendTo(this.firstChild.jQ);
    }
  };
  _.placeCursor = function(cursor) {
    cursor.prependTo(this.firstChild);
  };
  _.latex = function() {
    return this.ctrlSeq + this.firstChild.latex() + this.end;
  };
  _.redraw = function() {
    var blockjQ = this.firstChild.jQ;
    var bracketjQs = this.bracketjQs;

    batchCall(function () {
      var height = blockjQ.outerHeight()/+blockjQ.css('fontSize').slice(0,-2);
      return function () {scale(bracketjQs, min(1 + .2*(height - 1), 1.2), 1.05*height);};
    });
  };
});


function bracketProperties(open, close, ctrlSeq, end) {
  return {
    ctrlSeq: ctrlSeq,
    htmlTemplate: '<span class="mq-non-leaf">'
    +   '<span class="mq-scaled mq-paren">'+open+'</span>'
    +   '<span class="mq-non-leaf">&0</span>'
    +   '<span class="mq-scaled mq-paren">'+close+'</span>'
    + '</span>',
    textTemplate: [open, close],
    DOMTemplate: function (blocks) {
      return crel('span', {class: 'mq-non-leaf'},
        this.openEl,
        wrapBlock(crel('span', {class: 'mq-non-leaf'}), blocks[0]),
        this.closeEl
      );
    },
    open: open,
    close: close,
    end: '\\right'+end
  }
}

function makeBracket() {
  return P(Bracket, bracketProperties.apply(null, arguments));
}

LatexCmds.left = P(MathCommand, function(_) {
  _.parser = function() {
    var regex = Parser.regex;
    var string = Parser.string;
    var succeed = Parser.succeed;
    var block = latexMathParser.block;
    var optWhitespace = Parser.optWhitespace;

    return optWhitespace.then(regex(/^(?:[([|]|\\\{)/))
      .then(function(open) {
        if (open.charAt(0) === '\\') open = open.slice(1);

        var cmd = CharCmds[open]();

        return latexMathParser
          .map(function (block) {
            cmd.blocks = [ block ];
            block.adopt(cmd, 0, 0);
          })
          .then(string('\\right'))
          .skip(optWhitespace)
          .then(regex(/^(?:[\])|]|\\\})/))
          .then(function(close) {
            /*if (close.slice(-1) !== cmd.end.slice(-1)) {
              return Parser.fail('open doesn\'t match close');
            }*/

            return succeed(cmd);
          })
        ;
      })
    ;
  };
});

LatexCmds.right = P(MathCommand, function(_) {
  _.parser = function() {
    return Parser.fail('unmatched \\right');
  };
});

LatexCmds.lbrace =
CharCmds['{'] = makeBracket('{', '}', '\\{', '\\}');
LatexCmds.langle =
LatexCmds.lang = makeBracket('\u27E8','\u27E9','\\langle ','\\rangle ');

// Closing bracket matching opening bracket above
var CloseBracket = P(Bracket, function(_, _super) {
  _.createBefore = function(cursor) {
    // if I'm replacing a selection fragment, just wrap in parens
    if (this.replacedFragment) return _super.createBefore.call(this, cursor);

    // elsewise, if my parent is a matching open-paren, then close it here,
    // i.e. move everything after me in the open-paren to after the parens
    var openParen = cursor.parent.parent;
    if (openParen.ctrlSeq === this.ctrlSeq) {
      if (cursor.next) {
        var nextAll = MathFragment(cursor.next, openParen.firstChild.lastChild).disown();
        nextAll.adopt(openParen.parent, openParen, openParen.next);
        nextAll.jQ.insertAfter(openParen.jQ);
        if (cursor.next.respace) cursor.next.respace();
      }
      cursor.insertAfter(openParen);
      openParen.bubble('redraw');
    }
    // or if not, make empty paren group and put cursor inside it
    // (I think this behavior is weird - Han)
    else {
      _super.createBefore.call(this, cursor);
      cursor.appendTo(this.firstChild); // FIXME HACK
    }
  };
  _.finalizeTree = noop;
  _.placeCursor = function(cursor) {
    this.firstChild.blur();
    cursor.insertAfter(this);
  };
});

function makeCloseBracket() {
  return P(CloseBracket, bracketProperties.apply(null, arguments));
}

LatexCmds.rbrace =
CharCmds['}'] = makeCloseBracket('{','}','\\{','\\}');
LatexCmds.rangle =
LatexCmds.rang = makeCloseBracket('\u27E8','\u27E9','\\langle ','\\rangle ');

var Paren = P(Bracket, {});

function makeParen(open, close) {
  return P(Paren, bracketProperties(open, close, open, close));
}

LatexCmds.lparen =
CharCmds['('] = makeParen('(', ')');
LatexCmds.lbrack =
LatexCmds.lbracket =
CharCmds['['] = makeParen('[', ']');

var CloseParen = P(CloseBracket, {});

function makeCloseParen(open, close) {
  return P(Paren, bracketProperties(open, close, open, close));
}

LatexCmds.rparen =
CharCmds[')'] = makeCloseParen('(', ')');
LatexCmds.rbrack =
LatexCmds.rbracket =
CharCmds[']'] = makeCloseParen('[', ']');

//Temporarily disable square brackets (silently replace with ())
//This this to push people towards new point syntax
//in preparation for supporting lists with [] again
//TODO - re-enable square brackets once stats is ready (by deleting the following two lines)
LatexCmds.rbrack = LatexCmds.rbracket = CharCmds[']'] = CharCmds[')'];
LatexCmds.lbrack = LatexCmds.lbracket = CharCmds['['] = CharCmds['('];

var Pipes =
LatexCmds.lpipe =
LatexCmds.rpipe =
CharCmds['|'] = makeParen('|', '|');
CharCmds['|'].prototype.createBefore = function (cursor) {
  if (!cursor.next && cursor.parent.parent && cursor.parent.parent.end === this.end && !this.replacedFragment)
    cursor.insertAfter(cursor.parent.parent);
  else
    MathCommand.prototype.createBefore.call(this, cursor);
};
CharCmds['|'].prototype.finalizeTree = noop;

// DISABLED in DCG
var TextBlock =
LatexCmds.text =
LatexCmds.textnormal =
LatexCmds.textrm =
LatexCmds.textup =
LatexCmds.textmd = P(MathCommand, function(_, _super) {
  _.ctrlSeq = '\\text';
  _.htmlTemplate = '<span class="mq-text">&0</span>';
  _.DOMTemplate = function (blocks) {
    return wrapBlock(crel('span', {class: 'mq-text'}), blocks[0]);
  };
  _.replaces = function(replacedText) {
    if (replacedText instanceof MathFragment)
      this.replacedText = replacedText.remove().jQ.text();
    else if (typeof replacedText === 'string')
      this.replacedText = replacedText;
  };
  _.textTemplate = ['"', '"'];
  _.parser = function() {
    // TODO: correctly parse text mode
    var string = Parser.string;
    var regex = Parser.regex;
    var optWhitespace = Parser.optWhitespace;
    return optWhitespace
      .then(string('{')).then(regex(/^[^}]*/)).skip(string('}'))
      .map(function(text) {
        var cmd = TextBlock();
        cmd.createBlocks();
        var block = cmd.firstChild;
        for (var i = 0; i < text.length; i += 1) {
          var ch = VanillaSymbol(text.charAt(i));
          ch.adopt(block, block.lastChild, 0);
        }
        return cmd;
      })
    ;
  };
  _.createBlocks = function() {
    //FIXME: another possible Law of Demeter violation, but this seems much cleaner, like it was supposed to be done this way
    this.firstChild =
    this.lastChild =
      InnerTextBlock();

    this.blocks = [ this.firstChild ];

    this.firstChild.parent = this;
  };
  _.finalizeInsert = function() {
    //FIXME HACK blur removes the TextBlock
    this.firstChild.blur = function() { delete this.blur; return this; };
    _super.finalizeInsert.call(this);
  };
  _.createBefore = function(cursor) {
    _super.createBefore.call(this, this.cursor = cursor);

    if (this.replacedText)
      for (var i = 0; i < this.replacedText.length; i += 1)
        this.write(this.replacedText.charAt(i));
  };
  _.write = function(ch) {
    this.cursor.insertNew(VanillaSymbol(ch));
  };
  _.onKey = function(key, e) {
    //backspace and delete and ends of block don't unwrap
    if (!this.cursor.selection &&
      (
        (key === 'Backspace' && !this.cursor.prev) ||
        (key === 'Del' && !this.cursor.next)
      )
    ) {
      if (this.isEmpty())
        this.cursor.insertAfter(this);

      return false;
    }
  };
  _.onText = function(ch) {
    this.cursor.prepareEdit();
    if (ch !== '$')
      this.write(ch);
    else if (this.isEmpty())
      this.cursor.insertAfter(this).backspace().insertNew(VanillaSymbol('\\$','$'));
    else if (!this.cursor.next)
      this.cursor.insertAfter(this);
    else if (!this.cursor.prev)
      this.cursor.insertBefore(this);
    else { //split apart
      var next = TextBlock(MathFragment(this.cursor.next, this.firstChild.lastChild));
      next.placeCursor = function(cursor) { //FIXME HACK: pretend no prev so they don't get merged
        this.prev = 0;
        delete this.placeCursor;
        this.placeCursor(cursor);
      };
      next.firstChild.focus = function(){ return this; };
      this.cursor.insertAfter(this).insertNew(next);
      next.prev = this;
      this.cursor.insertBefore(next);
      delete next.firstChild.focus;
    }
    this.cursor.root.triggerSpecialEvent('render');
    return false;
  };
});

var InnerTextBlock = P(MathBlock, function(_, _super) {
  _.blur = function() {
    this.jQ.removeClass('mq-hasCursor');
    if (this.isEmpty()) {
      var textblock = this.parent, cursor = textblock.cursor;
      if (cursor.parent === this)
        this.jQ.addClass('mq-empty');
      else {
        cursor.hide();
        textblock.remove();
        if (cursor.next === textblock)
          cursor.next = textblock.next;
        else if (cursor.prev === textblock)
          cursor.prev = textblock.prev;

        cursor.show().parent.bubble('redraw');
      }
    }
    return this;
  };
  _.focus = function() {
    _super.focus.call(this);

    var textblock = this.parent;
    if (textblock.next.ctrlSeq === textblock.ctrlSeq) { //TODO: seems like there should be a better way to move MathElements around
      var innerblock = this,
        cursor = textblock.cursor,
        next = textblock.next.firstChild;

      next.eachChild(function(child){
        child.parent = innerblock;
        child.jQ.appendTo(innerblock.jQ);
      });

      if (this.lastChild)
        this.lastChild.next = next.firstChild;
      else
        this.firstChild = next.firstChild;

      next.firstChild.prev = this.lastChild;
      this.lastChild = next.lastChild;

      next.parent.remove();

      if (cursor.prev)
        cursor.insertAfter(cursor.prev);
      else
        cursor.prependTo(this);

      cursor.parent.bubble('redraw');
    }
    else if (textblock.prev.ctrlSeq === textblock.ctrlSeq) {
      var cursor = textblock.cursor;
      if (cursor.prev)
        textblock.prev.firstChild.focus();
      else
        cursor.appendTo(textblock.prev.firstChild);
    }
    return this;
  };
});


function makeTextBlock(latex, tagName, attrs) {
  return P(TextBlock, {
    ctrlSeq: latex,
    htmlTemplate: '<'+tagName+' '+
      (attrs.class ? 'class="' + attrs.class + '"' : '')+' '+
      (attrs.style ? 'style="' + attrs.style + '"' : '')+
      '>&0</'+tagName+'>',
    DOMTemplate: function (blocks) {
      var extendedAttrs = {'mathquill-block-id': blocks[0].id};
      for (var key in attrs) extendedAttrs[key] = attrs[key];
      return wrapBlock(crel(tagName, extendedAttrs), blocks[0]);
    }
  });
}

LatexCmds.em = LatexCmds.italic = LatexCmds.italics =
LatexCmds.emph = LatexCmds.textit = LatexCmds.textsl =
  makeTextBlock('\\textit', 'i', {class: 'mq-text'});
LatexCmds.strong = LatexCmds.bold = LatexCmds.textbf =
  makeTextBlock('\\textbf', 'b', {class: 'mq-text'});
LatexCmds.sf = LatexCmds.textsf =
  makeTextBlock('\\textsf', 'span', {class: 'mq-sans-serif mq-text'});
LatexCmds.tt = LatexCmds.texttt =
  makeTextBlock('\\texttt', 'span', {class: 'mq-monospace mq-text'});
LatexCmds.textsc =
  makeTextBlock('\\textsc', 'span', {style: 'font-variant:small-caps', class: 'mq-text'});
LatexCmds.uppercase =
  makeTextBlock('\\uppercase', 'span', {style: 'text-transform:uppercase', class: 'mq-text'});
LatexCmds.lowercase =
  makeTextBlock('\\lowercase', 'span', {style: 'text-transform:lowercase', class: 'mq-text'});

// input box to type a variety of LaTeX commands beginning with a backslash
// DISABLED in DCG
var LatexCommandInput =
P(MathCommand, function(_, _super) {
  _.ctrlSeq = '\\';
  _.replaces = function(replacedFragment) {
    this._replacedFragment = replacedFragment.disown();
    this.isEmpty = function() { return false; };
  };
  _.htmlTemplate = '<span class="mq-latex-command-input mq-non-leaf">\\<span>&0</span></span>';
  _.DOMTemplate = function (blocks) {
    return crel('span', {class: 'mq-latex-command-input mq-non-leaf'},
      wrapBlock(crel('span'), blocks[0])
    );
  };
  _.textTemplate = ['\\'];
  _.createBlocks = function() {
    _super.createBlocks.call(this);
    this.firstChild.focus = function() {
      this.parent.jQ.addClass('mq-hasCursor');
      if (this.isEmpty())
        this.parent.jQ.removeClass('mq-empty');

      return this;
    };
    this.firstChild.blur = function() {
      this.parent.jQ.removeClass('mq-hasCursor');
      if (this.isEmpty())
        this.parent.jQ.addClass('mq-empty');

      return this;
    };
  };
  _.createBefore = function(cursor) {
    _super.createBefore.call(this, cursor);
    this.cursor = cursor.appendTo(this.firstChild);
    if (this._replacedFragment) {
      var el = this.jQ[0];
      this.jQ =
        this._replacedFragment.jQ.addClass('mq-blur').bind(
          'mousedown mousemove', //FIXME: is monkey-patching the mousedown and mousemove handlers the right way to do this?
          function(e) {
            $(e.target = el).trigger(e);
            return false;
          }
        ).insertBefore(this.jQ).add(this.jQ);
    }
  };
  _.latex = function() {
    return '\\' + this.firstChild.latex() + ' ';
  };
  _.onKey = function(key, e) {
    if (key === 'Tab' || key === 'Enter') {
      this.renderCommand();
      this.cursor.root.triggerSpecialEvent('render');
      e.preventDefault();
      return false;
    }
  };
  _.onText = function(ch) {
    if (ch.match(/[a-z]/i)) {
      this.cursor.prepareEdit();
      this.cursor.insertNew(VanillaSymbol(ch));
      return false;
    }
    this.renderCommand();
    if (ch === ' ' || (ch === '\\' && this.firstChild.isEmpty())) {
      this.cursor.root.triggerSpecialEvent('render');
      return false;
    }
  };
  _.renderCommand = function() {
    this.jQ = this.jQ.last();
    this.remove();
    if (this.next) {
      this.cursor.insertBefore(this.next);
    } else {
      this.cursor.appendTo(this.parent);
    }

    var latex = this.firstChild.latex(), cmd;
    if (!latex) latex = 'backslash';
    this.cursor.insertCmd(latex, this._replacedFragment);
  };
});

var Binomial =
LatexCmds.binom =
LatexCmds.binomial = P(MathCommand, function(_, _super) {
  _.ctrlSeq = '\\binom';
  _.htmlTemplate =
      '<span class="mq-paren mq-scaled">(</span>'
    + '<span class="mq-non-leaf">'
    +   '<span class="mq-array mq-non-leaf">'
    +     '<span>&0</span>'
    +     '<span>&1</span>'
    +   '</span>'
    + '</span>'
    + '<span class="mq-paren mq-scaled">)</span>'
  ;
  _.DOMTemplate = function (blocks) {
    var frag = document.createDocumentFragment();
    frag.appendChild(crel('span', {class: 'mq-paren mq-scaled'}, '('));
    frag.appendChild(crel('span', {class: 'mq-non-leaf'},
      crel('span', {class: 'mq-array mq-non-leaf'},
        wrapBlock(crel('span'), blocks[0]),
        wrapBlock(crel('span'), blocks[1])
      )
    ));
    frag.appendChild(crel('span', {class: 'mq-paren mq-scaled'}, ')'));
    return frag;
  };
  _.textTemplate = ['choose(',',',')'];
  _.redraw = function() {
    var blockjQ = this.jQ.eq(1);

    var parens = this.jQ.filter('.mq-paren');

    batchCall(function () {
      var height = blockjQ.outerHeight()/+blockjQ.css('fontSize').slice(0,-2);
      return function () {scale(parens, min(1 + .2*(height - 1), 1.2), 1.05*height);};
    });
  };
  // vertical-align: middle, so
  _.expectedCursorYNextTo = Symbol.prototype.expectedCursorYNextTo;
});

var Choose =
LatexCmds.choose = P(Binomial, function(_) {
  _.createBefore = LiveFraction.prototype.createBefore;
});

var Vector =
LatexCmds.vector = P(MathCommand, function(_, _super) {
  _.ctrlSeq = '\\vector';
  _.htmlTemplate = '<span class="mq-array"><span>&0</span></span>';
  _.DOMTemplate = function (blocks) {
    return crel('span', {class: 'mq-array'}, wrapBlock(crel('span'), blocks[0]));
  };
  _.latex = function() {
    return '\\begin{matrix}' + this.foldChildren([], function(latex, child) {
      latex.push(child.latex());
      return latex;
    }).join('\\\\') + '\\end{matrix}';
  };
  _.text = function() {
    return '[' + this.foldChildren([], function(text, child) {
      text.push(child.text());
      return text;
    }).join() + ']';
  }
  _.createBefore = function(cursor) {
    _super.createBefore.call(this, this.cursor = cursor);
  };
  _.onKey = function(key, e) {
    var currentBlock = this.cursor.parent;

    if (currentBlock.parent === this) {
      if (key === 'Enter') { //enter
        var newBlock = MathBlock();
        newBlock.parent = this;
        newBlock.jQ = $('<span></span>')
          .attr(mqBlockId, newBlock.id)
          .insertAfter(currentBlock.jQ);
        if (currentBlock.next)
          currentBlock.next.prev = newBlock;
        else
          this.lastChild = newBlock;

        newBlock.next = currentBlock.next;
        currentBlock.next = newBlock;
        newBlock.prev = currentBlock;
        this.bubble('redraw').cursor.appendTo(newBlock);

        e.preventDefault();
        return false;
      }
      else if (key === 'Tab' && !currentBlock.next) {
        if (currentBlock.isEmpty()) {
          if (currentBlock.prev) {
            this.cursor.insertAfter(this);
            delete currentBlock.prev.next;
            this.lastChild = currentBlock.prev;
            currentBlock.jQ.remove();
            this.bubble('redraw');

            e.preventDefault();
            return false;
          }
          else
            return;
        }

        var newBlock = MathBlock();
        newBlock.parent = this;
        newBlock.jQ = $('<span></span>').attr(mqBlockId, newBlock.id).appendTo(this.jQ);
        this.lastChild = newBlock;
        currentBlock.next = newBlock;
        newBlock.prev = currentBlock;
        this.bubble('redraw').cursor.appendTo(newBlock);

        e.preventDefault();
        return false;
      }
      else if (e.which === 8) { //backspace
        if (currentBlock.isEmpty()) {
          if (currentBlock.prev) {
            this.cursor.appendTo(currentBlock.prev)
            currentBlock.prev.next = currentBlock.next;
          }
          else {
            this.cursor.insertBefore(this);
            this.firstChild = currentBlock.next;
          }

          if (currentBlock.next)
            currentBlock.next.prev = currentBlock.prev;
          else
            this.lastChild = currentBlock.prev;

          currentBlock.jQ.remove();
          if (this.isEmpty())
            this.cursor.deleteForward();
          else
            this.bubble('redraw');

          e.preventDefault();
          return false;
        }
        else if (!this.cursor.prev) {
          e.preventDefault();
          return false;
        }
      }
    }
  };
  // vertical-align: middle, so
  _.expectedCursorYNextTo = Binomial.prototype.expectedCursorYNextTo;
});

LatexCmds.MathQuillMathField = P(MathCommand, function(_, _super) {
  _.ctrlSeq = '\\MathQuillMathField';
  _.htmlTemplate = '<span class="mathquill-editable">&0</span>';
  _.DOMTemplate = function (blocks) {
    return wrapBlock(crel('span', {class: 'mathquill-editable'}), blocks[0]);
  };
  _.finalizeTree = function() {
    // parsed \MathQuillMathField{contents}, `this` is this MathCommand,
    // replace its sole child MathBlock with a RootMathBlock
    var self = this, rootBlock = RootMathBlock();

    delete MathElement[rootBlock.id];
    rootBlock.id = self.firstChild.id;
    MathElement[rootBlock.id] = rootBlock;

    self.firstChild.children().disown().adopt(rootBlock, 0, 0);
    rootBlock.parent = self;
    self.firstChild = self.lastChild = rootBlock;
    self.blocks = [ rootBlock ];

    rootBlock.jQ = self.jQ.wrapInner(crel('span', {class: 'mathquill-root-block'})).children();

    rootBlock.editable = true;
    var cursor = rootBlock.cursor = Cursor(rootBlock).appendTo(rootBlock);
    var textarea = setupTextarea(true, self.jQ, rootBlock, cursor);
    setupTouchHandle(true, rootBlock, cursor);
    focusBlurEvents(rootBlock, cursor, textarea);
    desmosCustomEvents(self.jQ, rootBlock, cursor);
  };

  _.latex = function(){ return this.firstChild.latex(); };
  _.text = function(){ return this.firstChild.text(); };
});
