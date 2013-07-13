/*************************************************
 * Abstract classes of math blocks and commands.
 ************************************************/

var uuid = (function() {
  var id = 0;

  return function() { return id += 1; };
})();

/**
 * Math tree node base class.
 * Some math-tree-specific extensions to Node.
 * Both MathBlock's and MathCommand's descend from it.
 */
var MathElement = P(Node, function(_) {
  _.init = function(obj) {
    this.id = uuid();
    MathElement[this.id] = this;
  };

  _.toString = function() {
    return '[MathElement '+this.id+']';
  };

  _.bubble = function(event /*, args... */) {
    var args = __slice.call(arguments, 1);

    for (var ancestor = this; ancestor; ancestor = ancestor.parent) {
      var res = ancestor[event] && ancestor[event].apply(ancestor, args);
      if (res === false) break;
    }

    return this;
  };

  _.postOrder = function(fn /*, args... */) {
    if (typeof fn === 'string') {
      var methodName = fn;
      fn = function(el) {
        if (methodName in el) el[methodName].apply(el, arguments);
      };
    }

    (function recurse(desc) {
      desc.eachChild(recurse);
      fn(desc);
    })(this);
  };

  _.jQ = $();
  _.jQadd = function(jQ) { this.jQ = this.jQ.add(jQ); };

  this.jQize = function(html) {
    // Sets the .jQ of the entire math subtree rooted at this command.
    // Expects .createBlocks() to have been called already, since it
    // calls .html().
    var jQ = $(html);

    function jQadd(el) {
      if (el.getAttribute) {
        var cmdId = el.getAttribute('mathquill-command-id');
        var blockId = el.getAttribute('mathquill-block-id');
        if (cmdId) MathElement[cmdId].jQadd(el);
        if (blockId) MathElement[blockId].jQadd(el);
      }
    }
    function traverse(el) {
      for (el = el.firstChild; el; el = el.nextSibling) {
        jQadd(el);
        if (el.firstChild) traverse(el);
      }
    }

    for (var i = 0; i < jQ.length; i += 1) {
      jQadd(jQ[i]);
      traverse(jQ[i]);
    }
    return jQ;
  };

  _.finalizeInsert = function() {
    var self = this;
    self.postOrder('finalizeTree');

    // note: this order is important.
    // empty elements need the empty box provided by blur to
    // be present in order for their dimensions to be measured
    // correctly in redraw.
    self.postOrder('blur');

    // adjust context-sensitive spacing
    self.postOrder('respace');
    if (self.next.respace) self.next.respace();
    if (self.prev.respace) self.prev.respace();

    self.postOrder('redraw');
    self.bubble('redraw');
    self.bubble('redraw');
  };
});

/**
 * Commands and operators, like subscripts, exponents, or fractions.
 * Descendant commands are organized into blocks.
 */
var MathCommand = P(MathElement, function(_, _super) {
  _.init = function(ctrlSeq, htmlTemplate, textTemplate) {
    var cmd = this;
    _super.init.call(cmd);

    if (!cmd.ctrlSeq) cmd.ctrlSeq = ctrlSeq;
    if (htmlTemplate) cmd.htmlTemplate = htmlTemplate;
    if (textTemplate) cmd.textTemplate = textTemplate;
  };

  // obvious methods
  _.replaces = function(replacedFragment) {
    replacedFragment.disown();
    this.replacedFragment = replacedFragment;
  };
  _.isEmpty = function() {
    return this.foldChildren(true, function(isEmpty, child) {
      return isEmpty && child.isEmpty();
    });
  };

  _.parser = function() {
    var block = latexMathParser.block;
    var self = this;

    return block.times(self.numBlocks()).map(function(blocks) {
      self.blocks = blocks;

      for (var i = 0; i < blocks.length; i += 1) {
        blocks[i].adopt(self, self.lastChild, 0);
      }

      return self;
    });
  };

  // createBefore(cursor) and the methods it calls
  _.createBefore = function(cursor) {
    var cmd = this;
    var replacedFragment = cmd.replacedFragment;

    cmd.createBlocks();
    MathElement.jQize(cmd.html());
    if (replacedFragment) {
      replacedFragment.adopt(cmd.firstChild, 0, 0);
      replacedFragment.jQ.appendTo(cmd.firstChild.jQ);
    }

    cursor.jQ.before(cmd.jQ);
    cursor.prev = cmd.adopt(cursor.parent, cursor.prev, cursor.next);

    cmd.finalizeInsert(cursor);

    cmd.placeCursor(cursor);
  };
  _.createBlocks = function() {
    var cmd = this,
      numBlocks = cmd.numBlocks(),
      blocks = cmd.blocks = Array(numBlocks);

    for (var i = 0; i < numBlocks; i += 1) {
      var newBlock = blocks[i] = MathBlock();
      newBlock.adopt(cmd, cmd.lastChild, 0);
    }
  };
  _.respace = noop; //placeholder for context-sensitive spacing
  _.placeCursor = function(cursor) {
    //append the cursor to the first empty child, or if none empty, the last one
    cursor.appendTo(this.foldChildren(this.firstChild, function(prev, child) {
      return prev.isEmpty() ? prev : child;
    }));
  };

  _.seek = function(cursor, pageX, pageY) {
    function getBounds(node) {
      var bounds = {}
      bounds.prev = node.jQ.offset().left;
      bounds.next = bounds.prev + node.jQ.outerWidth();
      return bounds;
    }

    var cmd = this;
    var cmdBounds = getBounds(cmd);

    if (cmd.up || cmd.down) {
      var topBound = cmd.jQ.offset().top;
      if (cmd.up && pageY < topBound) return cmd.up.seek(cursor, pageX, pageY);
      if (cmd.down) {
        var bottomBound = topBound + cmd.jQ.outerHeight();
        if (pageY > bottomBound) return cmd.down.seek(cursor, pageX, pageY);
      }
    }

    var leftLeftBound = cmdBounds.prev;
    cmd.eachChild(function(block) {
      var blockBounds = getBounds(block);
      if (pageX < blockBounds.prev) {
        // closer to this block's left bound, or the bound left of that?
        if (pageX - leftLeftBound < blockBounds.prev - pageX) {
          if (block.prev) cursor.appendTo(block.prev);
          else cursor.insertBefore(cmd);
        }
        else cursor.prependTo(block);
        return false;
      }
      else if (pageX > blockBounds.next) {
        if (block.next) leftLeftBound = blockBounds.next; // continue to next block
        else { // last (rightmost) block
          // closer to this block's right bound, or the cmd's right bound?
          if (cmdBounds.next - pageX < pageX - blockBounds.next) {
            cursor.insertAfter(cmd);
          }
          else cursor.appendTo(block);
        }
      }
      else {
        block.seek(cursor, pageX, pageY);
        return false;
      }
    });

    var leftOfCmd = pageX < cmd.firstChild.jQ.offset().left;
    var rightOfCmd = pageX > cmd.lastChild.jQ.offset().left + cmd.lastChild.jQ.outerWidth();
    if (leftOfCmd || rightOfCmd) {
      var origSqDist = cursor.sqDistFrom(pageX, pageY);
      var origParent = cursor.parent, origNext = cursor.next;
      if (leftOfCmd) cursor.insertBefore(cmd);
      else cursor.insertAfter(cmd);
      if (!(cursor.sqDistFrom(pageX, pageY) < origSqDist)) {
        origNext ? cursor.insertBefore(origNext) : cursor.appendTo(origParent);
      }
    }
  };

  // remove()
  _.remove = function() {
    this.disown()
    this.jQ.remove();

    this.postOrder(function(el) { delete MathElement[el.id]; });

    return this;
  };

  // methods involved in creating and cross-linking with HTML DOM nodes
  /*
    They all expect an .htmlTemplate like
      '<span>&0</span>'
    or
      '<span><span>&0</span><span>&1</span></span>'

    See html.test.js for more examples.

    Requirements:
    - For each block of the command, there must be exactly one "block content
      marker" of the form '&<number>' where <number> is the 0-based index of the
      block. (Like the LaTeX \newcommand syntax, but with a 0-based rather than
      1-based index, because JavaScript because C because Dijkstra.)
    - The block content marker must be the sole contents of the containing
      element, there can't even be surrounding whitespace, or else we can't
      guarantee sticking to within the bounds of the block content marker when
      mucking with the HTML DOM.
    - The HTML not only must be well-formed HTML (of course), but also must
      conform to the XHTML requirements on tags, specifically all tags must
      either be self-closing (like '<br/>') or come in matching pairs.
      Close tags are never optional.

    Note that &<number> isn't well-formed HTML; if you wanted a literal '&123',
    your HTML template would have to have '&amp;123'.
  */
  _.numBlocks = function() {
    var matches = this.htmlTemplate.match(/&\d+/g);
    return matches ? matches.length : 0;
  };
  _.html = function() {
    // Render the entire math subtree rooted at this command, as HTML.
    // Expects .createBlocks() to have been called already, since it uses the
    // .blocks array of child blocks.
    //
    // See html.test.js for example templates and intended outputs.
    //
    // Given an .htmlTemplate as described above,
    // - insert the mathquill-command-id attribute into all top-level tags,
    //   which will be used to set this.jQ in .jQize().
    //   This is straightforward:
    //     * tokenize into tags and non-tags
    //     * loop through top-level tokens:
    //         * add #cmdId attribute macro to top-level self-closing tags
    //         * else add #cmdId attribute macro to top-level open tags
    //             * skip the matching top-level close tag and all tag pairs
    //               in between
    // - for each block content marker,
    //     + replace it with the contents of the corresponding block,
    //       rendered as HTML
    //     + insert the mathquill-block-id attribute into the containing tag
    //   This is even easier, a quick regex replace, since block tags cannot
    //   contain anything besides the block content marker.
    //
    // Two notes:
    // - The outermost loop through top-level tokens should never encounter any
    //   top-level close tags, because we should have first encountered a
    //   matching top-level open tag, all inner tags should have appeared in
    //   matching pairs and been skipped, and then we should have skipped the
    //   close tag in question.
    // - All open tags should have matching close tags, which means our inner
    //   loop should always encounter a close tag and drop nesting to 0. If
    //   a close tag is missing, the loop will continue until i >= tokens.length
    //   and token becomes undefined. This will not infinite loop, even in
    //   production without pray(), because it will then TypeError on .slice().

    var cmd = this;
    var blocks = cmd.blocks;
    var cmdId = ' mathquill-command-id=' + cmd.id;
    var tokens = cmd.htmlTemplate.match(/<[^<>]+>|[^<>]+/g);

    pray('no unmatched angle brackets', tokens.join('') === this.htmlTemplate);

    // add cmdId to all top-level tags
    for (var i = 0, token = tokens[0]; token; i += 1, token = tokens[i]) {
      // top-level self-closing tags
      if (token.slice(-2) === '/>') {
        tokens[i] = token.slice(0,-2) + cmdId + '/>';
      }
      // top-level open tags
      else if (token.charAt(0) === '<') {
        pray('not an unmatched top-level close tag', token.charAt(1) !== '/');

        tokens[i] = token.slice(0,-1) + cmdId + '>';

        // skip matching top-level close tag and all tag pairs in between
        var nesting = 1;
        do {
          i += 1, token = tokens[i];
          pray('no missing close tags', token);
          // close tags
          if (token.slice(0,2) === '</') {
            nesting -= 1;
          }
          // non-self-closing open tags
          else if (token.charAt(0) === '<' && token.slice(-2) !== '/>') {
            nesting += 1;
          }
        } while (nesting > 0);
      }
    }
    return tokens.join('').replace(/>&(\d+)/g, function($0, $1) {
      return ' mathquill-block-id=' + blocks[$1].id + '>' + blocks[$1].join('html');
    });
  };

  // methods to export a string representation of the math tree
  _.latex = function() {
    return this.foldChildren(this.ctrlSeq, function(latex, child) {
      return latex + '{' + (child.latex() || ' ') + '}';
    });
  };
  _.textTemplate = [''];
  _.text = function() {
    var i = 0;
    return this.foldChildren(this.textTemplate[i], function(text, child) {
      i += 1;
      var child_text = child.text();
      if (text && this.textTemplate[i] === '('
          && child_text[0] === '(' && child_text.slice(-1) === ')')
        return text + child_text.slice(1, -1) + this.textTemplate[i];
      return text + child.text() + (this.textTemplate[i] || '');
    });
  };
});

/**
 * Lightweight command without blocks or children.
 */
var Symbol = P(MathCommand, function(_, _super) {
  _.init = function(ctrlSeq, html, text) {
    if (!text) text = ctrlSeq && ctrlSeq.length > 1 ? ctrlSeq.slice(1) : ctrlSeq;

    _super.init.call(this, ctrlSeq, html, [ text ]);
  };

  _.parser = function() { return Parser.succeed(this); };
  _.numBlocks = function() { return 0; };

  _.replaces = function(replacedFragment) {
    replacedFragment.remove();
  };
  _.createBlocks = noop;

  _.seek = function(cursor, pageX, pageY) {
    // insert at whichever side the click was closer to
    if (pageX - this.jQ.offset().left < this.jQ.outerWidth()/2)
      cursor.insertBefore(this);
    else
      cursor.insertAfter(this);
  };

  _.latex = function(){ return this.ctrlSeq; };
  _.text = function(){ return this.textTemplate; };
  _.placeCursor = noop;
  _.isEmpty = function(){ return true; };
});

/**
 * Children and parent of MathCommand's. Basically partitions all the
 * symbols and operators that descend (in the Math DOM tree) from
 * ancestor operators.
 */
var MathBlock = P(MathElement, function(_) {
  _.join = function(methodName) {
    return this.foldChildren('', function(fold, child) {
      return fold + child[methodName]();
    });
  };
  _.latex = function() { return this.join('latex'); };
  _.text = function() {
    return this.firstChild === this.lastChild ?
      this.firstChild.text() :
      '(' + this.join('text') + ')'
    ;
  };
  _.isEmpty = function() {
    return this.firstChild === 0 && this.lastChild === 0;
  };
  _.seek = function(cursor, pageX, pageY) {
    var node = this.lastChild;
    if (!node || node.jQ.offset().left + node.jQ.outerWidth() < pageX) {
      return cursor.appendTo(this);
    }
    if (pageX < this.firstChild.jQ.offset().left) return cursor.prependTo(this);
    while (pageX < node.jQ.offset().left) node = node.prev;
    node.seek(cursor, pageX, pageY);
    // XXX HACK for optimal Euclidean distance
    var bestSqDist = cursor.sqDistFrom(pageX, pageY);
    var bestParent = cursor.parent, bestNext = cursor.next;
    if (pageX < node.jQ.offset().left + node.jQ.outerWidth()/4) {
      if (cursor.next !== node) {
        cursor.insertBefore(node);
        var sqDist = cursor.sqDistFrom(pageX, pageY);
        if (sqDist < bestSqDist) {
          bestSqDist = sqDist, bestParent = cursor.parent, bestNext = cursor.next;
        }
      }
      if (node.prev) {
        node.prev.seek(cursor, pageX, pageY);
        var sqDist = cursor.sqDistFrom(pageX, pageY);
      }
      if (!(sqDist < bestSqDist)) {
        bestNext ? cursor.insertBefore(bestNext) : cursor.appendTo(bestParent);
      }
    }
    else if (node.jQ.offset().left + node.jQ.outerWidth()*3/4 < pageX) {
      if (cursor.prev !== node) {
        cursor.insertAfter(node);
        var sqDist = cursor.sqDistFrom(pageX, pageY);
        if (sqDist < bestSqDist) {
          bestSqDist = sqDist, bestParent = cursor.parent, bestNext = cursor.next;
        }
      }
      if (node.next) {
        node.next.seek(cursor, pageX, pageY);
        var sqDist = cursor.sqDistFrom(pageX, pageY);
      }
      if (!(sqDist < bestSqDist)) {
        bestNext ? cursor.insertBefore(bestNext) : cursor.appendTo(bestParent);
      }
    }
  };
  _.focus = function() {
    this.jQ.addClass('hasCursor');
    this.jQ.removeClass('empty');

    return this;
  };
  _.blur = function() {
    this.jQ.removeClass('hasCursor');
    if (this.isEmpty())
      this.jQ.addClass('empty');

    return this;
  };
});

/**
 * Math tree fragment base class.
 * Some math-tree-specific extensions to Fragment.
 */
var MathFragment = P(Fragment, function(_, _super) {
  _.init = function(first, last) {
    // just select one thing if only one argument
    _super.init.call(this, first, last || first);
    this.jQ = this.fold($(), function(jQ, child){ return child.jQ.add(jQ); });
  };
  _.latex = function() {
    return this.fold('', function(latex, el){ return latex + el.latex(); });
  };
  _.remove = function() {
    this.jQ.remove();

    this.each(function(el) {
      el.postOrder(function(desc) {
        delete MathElement[desc.id];
      });
    });

    return this.disown();
  };
});
