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
    if (!jQ.hasClass('matrixed-container')) {
      jQ.addClass('matrixed-container')
      .wrapInner('<span class="matrixed"></span>');
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

var Style = P(MathCommand, function(_, _super) {
  _.init = function(ctrlSeq, tagName, attrs) {
    _super.init.call(this, ctrlSeq, '<'+tagName+' '+attrs+'>&0</'+tagName+'>');
  };
});

//fonts
LatexCmds.mathrm = bind(Style, '\\mathrm', 'span', 'class="roman font"');
LatexCmds.mathit = bind(Style, '\\mathit', 'i', 'class="font"');
LatexCmds.mathbf = bind(Style, '\\mathbf', 'b', 'class="font"');
LatexCmds.mathsf = bind(Style, '\\mathsf', 'span', 'class="sans-serif font"');
LatexCmds.mathtt = bind(Style, '\\mathtt', 'span', 'class="monospace font"');
//text-decoration
LatexCmds.underline = bind(Style, '\\underline', 'span', 'class="non-leaf underline"');
LatexCmds.overline = LatexCmds.bar = bind(Style, '\\overline', 'span', 'class="non-leaf overline"');

var SupSub = P(MathCommand, function(_, _super) {
  _.init = function(ctrlSeq, tag, text) {
    _super.init.call(this, ctrlSeq, '<'+tag+' class="non-leaf"><span class="non-leaf '+tag+'">&0</span></'+tag+'>', [ text ]);
  };
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
        this.jQ.addClass('int');
      }
    }
    else {
      if (this['int']) {
        this['int'] = false;
        this.jQ.removeClass('int');
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

LatexCmds.subscript =
LatexCmds._ = bind(SupSub, '_', 'sub', '_');

LatexCmds.superscript =
LatexCmds.supscript =
LatexCmds['^'] = bind(SupSub, '^', 'sup', '**');

var BigSymbol = P(MathCommand, function(_, _super) {
  _.init = function(ch, html) {
    var htmlTemplate =
        '<span class="large-operator non-leaf">'
      +   '<span class="to"><span>&1</span></span>'
      +   '<big>'+html+'</big>'
      +   '<span class="from"><span>&0</span></span>'
      + '</span>'
    ;
    Symbol.prototype.init.call(this, ch, htmlTemplate);
  };
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
LatexCmds['\u2211'] = LatexCmds.sum = LatexCmds.summation = bind(BigSymbol,'\\sum ','&sum;');
LatexCmds['\u220F'] = LatexCmds.prod = LatexCmds.product = bind(BigSymbol,'\\prod ','&prod;');

var Fraction =
LatexCmds.frac =
LatexCmds.dfrac =
LatexCmds.cfrac =
LatexCmds.fraction = P(MathCommand, function(_, _super) {
  _.ctrlSeq = '\\frac';
  _.htmlTemplate =
      '<span class="fraction non-leaf">'
    +   '<span class="numerator">&0</span>'
    +   '<span class="mq-denominator">&1</span>'
    +   '<span style="display:inline-block;width:0;overflow:hidden">&nbsp;</span>'
    + '</span>'
  ;
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
      '<span class="non-leaf">'
    +   '<span class="scaled sqrt-prefix">&radic;</span>'
    +   '<span class="non-leaf sqrt-stem">&0</span>'
    + '</span>'
  ;
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
    scale(block.prev(), 1, block.innerHeight()/+block.css('fontSize').slice(0,-2) - .1);
  };
});


var NthRoot =
LatexCmds.nthroot = P(SquareRoot, function(_, _super) {
  _.htmlTemplate =
      '<sup class="nthroot non-leaf">&0</sup>'
    + '<span class="scaled">'
    +   '<span class="sqrt-prefix scaled">&radic;</span>'
    +   '<span class="sqrt-stem non-leaf">&1</span>'
    + '</span>'
  ;
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
  _.init = function(open, close, ctrlSeq, end) {
    _super.init.call(this, '\\left'+ctrlSeq,
        '<span class="non-leaf">'
      +   '<span class="scaled paren">'+open+'</span>'
      +   '<span class="non-leaf">&0</span>'
      +   '<span class="scaled paren">'+close+'</span>'
      + '</span>',
      [open, close]);
    this.end = '\\right'+end;
  };
  _.jQadd = function() {
    _super.jQadd.apply(this, arguments);
    var jQ = this.jQ;
    this.bracketjQs = jQ.children(':first').add(jQ.children(':last'));
  };
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

    var height = blockjQ.outerHeight()/+blockjQ.css('fontSize').slice(0,-2);

    scale(this.bracketjQs, min(1 + .2*(height - 1), 1.2), 1.05*height);
  };
});

LatexCmds.left = P(MathCommand, function(_) {
  _.parser = function() {
    var regex = Parser.regex;
    var string = Parser.string;
    var regex = Parser.regex;
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
            if (close.slice(-1) !== cmd.end.slice(-1)) {
              return Parser.fail('open doesn\'t match close');
            }

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
CharCmds['{'] = bind(Bracket, '{', '}', '\\{', '\\}');
LatexCmds.langle =
LatexCmds.lang = bind(Bracket, '&lang;','&rang;','\\langle ','\\rangle ');

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

LatexCmds.rbrace =
CharCmds['}'] = bind(CloseBracket, '{','}','\\{','\\}');
LatexCmds.rangle =
LatexCmds.rang = bind(CloseBracket, '&lang;','&rang;','\\langle ','\\rangle ');

var parenMixin = function(_, _super) {
  _.init = function(open, close) {
    _super.init.call(this, open, close, open, close);
  };
};

var Paren = P(Bracket, parenMixin);

LatexCmds.lparen =
CharCmds['('] = bind(Paren, '(', ')');
LatexCmds.lbrack =
LatexCmds.lbracket =
CharCmds['['] = bind(Paren, '[', ']');

var CloseParen = P(CloseBracket, parenMixin);

LatexCmds.rparen =
CharCmds[')'] = bind(CloseParen, '(', ')');
LatexCmds.rbrack =
LatexCmds.rbracket =
CharCmds[']'] = bind(CloseParen, '[', ']');

var Pipes =
LatexCmds.lpipe =
LatexCmds.rpipe =
CharCmds['|'] = P(Paren, function(_, _super) {
  _.init = function() {
    _super.init.call(this, '|', '|');
  }

  _.createBefore = function(cursor) {
    if (!cursor.next && cursor.parent.parent && cursor.parent.parent.end === this.end && !this.replacedFragment)
      cursor.insertAfter(cursor.parent.parent);
    else
      MathCommand.prototype.createBefore.call(this, cursor);
  };
  _.finalizeTree = noop;
});

// DISABLED in DCG
var TextBlock =
LatexCmds.text =
LatexCmds.textnormal =
LatexCmds.textrm =
LatexCmds.textup =
LatexCmds.textmd = P(MathCommand, function(_, _super) {
  _.ctrlSeq = '\\text';
  _.htmlTemplate = '<span class="text">&0</span>';
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
    this.jQ.removeClass('hasCursor');
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
    htmlTemplate: '<'+tagName+' '+attrs+'>&0</'+tagName+'>'
  });
}

LatexCmds.em = LatexCmds.italic = LatexCmds.italics =
LatexCmds.emph = LatexCmds.textit = LatexCmds.textsl =
  makeTextBlock('\\textit', 'i', 'class="text"');
LatexCmds.strong = LatexCmds.bold = LatexCmds.textbf =
  makeTextBlock('\\textbf', 'b', 'class="text"');
LatexCmds.sf = LatexCmds.textsf =
  makeTextBlock('\\textsf', 'span', 'class="sans-serif text"');
LatexCmds.tt = LatexCmds.texttt =
  makeTextBlock('\\texttt', 'span', 'class="monospace text"');
LatexCmds.textsc =
  makeTextBlock('\\textsc', 'span', 'style="font-variant:small-caps" class="text"');
LatexCmds.uppercase =
  makeTextBlock('\\uppercase', 'span', 'style="text-transform:uppercase" class="text"');
LatexCmds.lowercase =
  makeTextBlock('\\lowercase', 'span', 'style="text-transform:lowercase" class="text"');

// input box to type a variety of LaTeX commands beginning with a backslash
// DISABLED in DCG
var LatexCommandInput =
P(MathCommand, function(_, _super) {
  _.ctrlSeq = '\\';
  _.replaces = function(replacedFragment) {
    this._replacedFragment = replacedFragment.disown();
    this.isEmpty = function() { return false; };
  };
  _.htmlTemplate = '<span class="latex-command-input non-leaf">\\<span>&0</span></span>';
  _.textTemplate = ['\\'];
  _.createBlocks = function() {
    _super.createBlocks.call(this);
    this.firstChild.focus = function() {
      this.parent.jQ.addClass('hasCursor');
      if (this.isEmpty())
        this.parent.jQ.removeClass('mq-empty');

      return this;
    };
    this.firstChild.blur = function() {
      this.parent.jQ.removeClass('hasCursor');
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
        this._replacedFragment.jQ.addClass('blur').bind(
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
      '<span class="paren scaled">(</span>'
    + '<span class="non-leaf">'
    +   '<span class="array non-leaf">'
    +     '<span>&0</span>'
    +     '<span>&1</span>'
    +   '</span>'
    + '</span>'
    + '<span class="paren scaled">)</span>'
  ;
  _.textTemplate = ['choose(',',',')'];
  _.redraw = function() {
    var blockjQ = this.jQ.eq(1);

    var height = blockjQ.outerHeight()/+blockjQ.css('fontSize').slice(0,-2);

    var parens = this.jQ.filter('.paren');
    scale(parens, min(1 + .2*(height - 1), 1.2), 1.05*height);
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
  _.htmlTemplate = '<span class="array"><span>&0</span></span>';
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
