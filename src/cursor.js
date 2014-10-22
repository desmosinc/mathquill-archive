/********************************************
 * Cursor and Selection "singleton" classes
 *******************************************/

/* The main thing that manipulates the Math DOM. Makes sure to manipulate the
HTML DOM to match. */

/* Sort of singletons, since there should only be one per editable math
textbox, but any one HTML document can contain many such textboxes, so any one
JS environment could actually contain many instances. */

//A fake cursor in the fake textbox that the math is rendered in.
var Cursor = P(function(_) {
  _.init = function(root) {
    this.parent = this.root = root;
    var jQ = this.jQ = this._jQ = $('<span class="mq-cursor"><span class="mq-line">&zwj;</span></span>');

    //closured for setInterval
    this.blink = function(){ jQ.toggleClass('mq-blink'); }

    this.upDownCache = {};

    this.handle = $('<span class="mq-handle"></span>');
    this.handleAnchor = $('<span class="mq-handle-anchor" ' +
                                'style="display:none"></span>')
                        .append(this.handle).insertAfter(root.jQ);
    this.handleAnchor.top = this.handleAnchor.left = 0;
  };

  _.prev = 0;
  _.next = 0;
  _.parent = 0;
  _.showHandle = function() {
    //temporary: remove handle
    return this;

    if (!this.handleAnchor.visible) {
      this.handleAnchor.show();
      this.repositionHandle(this.jQ[0].getBoundingClientRect());
      this.handleAnchor.visible = true;
    }
    return this;
  };
  _.hideHandle = function() {
    //temporary: remove handle
    return this;

    if (this.handleAnchor.visible) {
      this.handleAnchor.hide();
      delete this.handleAnchor.visible;
    }
    return this;
  };
  _.repositionHandle = function(cursorRect) {
    //temporary: remove handle
    return;

    var anchor = this.handleAnchor;
    var anchorRect = anchor[0].getBoundingClientRect();
    anchor.css({
      top: anchor.top += cursorRect.bottom - anchorRect.bottom,
      left: anchor.left += cursorRect.left - anchorRect.left
    });
  };
  _.show = function(keepHandle) {
    if (!keepHandle) this.hideHandle();
    this.jQ = this._jQ.removeClass('mq-blink');
    if ('intervalId' in this) //already was shown, just restart interval
      clearInterval(this.intervalId);
    else { //was hidden and detached, insert this.jQ back into HTML DOM
      if (this.next) {
        if (this.selection && this.selection.first.prev === this.prev)
          this.jQ.insertBefore(this.selection.jQ);
        else
          this.jQ.insertBefore(this.next.jQ.first());
      }
      else
        this.jQ.appendTo(this.parent.jQ);
      this.parent.focus();
    }
    this.intervalId = setInterval(this.blink, 500);
    return this;
  };
  _.hide = function() {
    this.hideHandle();
    if ('intervalId' in this)
      clearInterval(this.intervalId);
    delete this.intervalId;
    this.jQ.detach();
    this.jQ = $();
    return this;
  };
  _.insertAt = function(parent, prev, next) {
    var old_parent = this.parent;

    this.parent = parent;
    this.prev = prev;
    this.next = next;

    old_parent.blur(); //blur may need to know cursor's destination
  };
  _.insertBefore = function(el) {
    this.insertAt(el.parent, el.prev, el)
    this.parent.jQ.addClass('mq-hasCursor');
    this.jQ.insertBefore(el.jQ.first());
    return this;
  };
  _.insertAfter = function(el) {
    this.insertAt(el.parent, el, el.next);
    this.parent.jQ.addClass('mq-hasCursor');
    this.jQ.insertAfter(el.jQ.last());
    return this;
  };
  _.prependTo = function(el) {
    this.insertAt(el, 0, el.firstChild);
    this.jQ.prependTo(el.jQ);
    el.focus();
    return this;
  };
  _.appendTo = function(el) {
    this.insertAt(el, el.lastChild, 0);
    this.jQ.appendTo(el.jQ);
    el.focus();
    return this;
  };
  _.hopLeft = function() {
    this.jQ.insertBefore(this.prev.jQ.first());
    this.next = this.prev;
    this.prev = this.prev.prev;
    return this;
  };
  _.hopRight = function() {
    this.jQ.insertAfter(this.next.jQ.last());
    this.prev = this.next;
    this.next = this.next.next;
    return this;
  };
  _.moveLeftWithin = function(block) {
    if (this.prev) {
      // FIXME HACK: when moving right to left, want to go into NthRoot's body,
      // which is its lastChild.
      if (this.prev instanceof NthRoot) this.appendTo(this.prev.lastChild);
      else if (this.prev.up instanceof MathBlock) this.appendTo(this.prev.up);
      else if (this.prev.firstChild) this.appendTo(this.prev.firstChild)
      else this.hopLeft();
    }
    else {
      // unless we're at the beginning of the containing block, escape left
      if (this.parent !== block) this.insertBefore(this.parent.parent);
      else if (block.moveOutOf) block.moveOutOf('left', this);
    }
  };
  _.moveRightWithin = function(block) {
    if (this.next) {
      if (this.next.up instanceof MathBlock) this.prependTo(this.next.up);
      else if (this.next.firstChild) this.prependTo(this.next.firstChild)
      else this.hopRight();
    }
    else {
      // unless we're at the beginning of the containing block, escape left
      if (this.parent !== block) this.insertAfter(this.parent.parent);
      else if (block.moveOutOf) block.moveOutOf('right', this);
    }
  };
  _.moveLeft = function() {
    clearUpDownCache(this);

    if (this.selection) {
      this.insertBefore(this.selection.first).clearSelection();
    //hack by eli: move all the way past subscripts
    } else if (this.prev instanceof SupSub && this.prev.ctrlSeq === '_') {
      this.moveLeftWithin(this.root);
      while (this.isInSubscript()) this.moveLeftWithin(this.root);
    } else {
      this.moveLeftWithin(this.root);
    }

    this.root.triggerSpecialEvent('cursorMoved');
    return this.show();
  };
  _.moveRight = function() {
    clearUpDownCache(this);

    if (this.selection) {
      this.insertAfter(this.selection.last).clearSelection();
    //hack by eli: move all the way past subscripts
    } else if (this.next instanceof SupSub && this.next.ctrlSeq === '_') {
      this.moveRightWithin(this.root);
      while (this.isInSubscript()) this.moveRightWithin(this.root);
    } else {
      this.moveRightWithin(this.root);
    }
    this.root.triggerSpecialEvent('cursorMoved');
    return this.show();
  };

  /**
   * moveUp and moveDown have almost identical algorithms:
   * - first check next and prev, if so prepend/appendTo them
   * - else check the parent's 'up'/'down' property - if it's a function,
   *   call it with the cursor as the sole argument and use the return value.
   *
   *   Given undefined, will bubble up to the next ancestor block.
   *   Given false, will stop bubbling.
   *   Given a MathBlock,
   *     + moveUp will appendTo it
   *     + moveDown will prependTo it
   *
   */
  _.moveUp = function() { return moveUpDown(this, 'up'); };
  _.moveDown = function() { return moveUpDown(this, 'down'); };
  function moveUpDown(self, dir) {
    if (self.next[dir]) self.prependTo(self.next[dir]);
    else if (self.prev[dir]) self.appendTo(self.prev[dir]);
    else {
      var ancestorBlock = self.parent;
      do {
        var prop = ancestorBlock[dir];
        if (prop) {
          if (typeof prop === 'function') prop = ancestorBlock[dir](self);
          if (prop === false || prop instanceof MathBlock) {
            self.upDownCache[ancestorBlock.id] = { parent: self.parent, prev: self.prev, next: self.next };

            if (prop instanceof MathBlock) {
              var cached = self.upDownCache[prop.id];

              if (cached) {
                if (cached.next) {
                  self.insertBefore(cached.next);
                } else {
                  self.appendTo(cached.parent);
                }
              } else {
                var coords = self.jQ[0].getBoundingClientRect();
                var cachedClientRect = cachedClientRectFnForNewCache();
                cachedClientRect.scrollLeft = 0; // only used in this event thread
                prop.seek(self, coords.left, coords.bottom, prop, cachedClientRect);
              }
            }
            break;
          }
        }
        ancestorBlock = ancestorBlock.parent.parent;
      } while (ancestorBlock);
    }

    return self.clearSelection().show();
  }

  _.seek = function(target, clientX, clientY, clientRect, keepHandle) {
    clearUpDownCache(this);
    var cursor = this.clearSelection().show(keepHandle);

    var nodeId = target.attr(mqBlockId) || target.attr(mqCmdId);
    if (!nodeId) {
      var targetParent = target.parent();
      nodeId = targetParent.attr(mqBlockId) || targetParent.attr(mqCmdId);
    }
    var node = nodeId ? MathElement[nodeId] : cursor.root;
    pray('nodeId is the id of some Node that exists', node);

    var dx = clientRect.scrollLeft = this.root.jQ.scrollLeft();
    node.seek(cursor, clientX + dx, clientY, cursor.root, clientRect);
    delete clientRect.scrollLeft; // be defensive: was only valid in this event
                                  // thread, unlike the cache of clientRect's

    this.root.scrollHoriz(); // before .selectFrom when mouse-selecting, so
      // always hits no-selection case in scrollHoriz and scrolls slower

    return cursor;
  };
  function offset(self) {
    //in Opera 11.62, .getBoundingClientRect() and hence jQuery::offset()
    //returns all 0's on inline elements with negative margin-right (like
    //the cursor) at the end of their parent, so temporarily remove the
    //negative margin-right when calling jQuery::offset()
    //Opera bug DSK-360043
    //http://bugs.jquery.com/ticket/11523
    //https://github.com/jquery/jquery/pull/717
    var offset = self.jQ.removeClass('mq-cursor').offset();
    self.jQ.addClass('mq-cursor');
    return offset;
  }
  _.writeLatex = function(latex) {
    var self = this;
    clearUpDownCache(self);
    self.show().deleteSelection();

    var all = Parser.all;
    var eof = Parser.eof;

    var block = latexMathParser.skip(eof).or(all.result(false)).parse(latex);

    if (block && !block.isEmpty()) {
      block.children().adopt(self.parent, self.prev, self.next);
      var html = block.join('html');
      var jQ = MathElement.jQize(html);
      jQ.insertBefore(self.jQ);
      self.prev = block.lastChild;
      block.finalizeInsert();
      self.parent.bubble('redraw');
    }

    return this;
  };

  _.isInSubscript = function () {
    if (!this.parent || !this.parent.parent) return false;
    var p = this.parent.parent;
    if (!(p instanceof SupSub)) return false;
    return (p.ctrlSeq === '_' && p.firstChild === this.parent);
  };

  _.write =
  _.insertCh = function(ch) {
    //Hack by Eli: don't exponentiate if there's nothing before the cursor
    if ((ch == '^' || ch == '_') && !this.prev) return;

    //Hack #2 by Eli: break out of the end of exponents
    if (
      "+=-<>~".indexOf(ch) >= 0 && this.parent.parent.ctrlSeq === '^'
      && !this.next && this.prev
      //don't break out of complex exponents. more likely the user knows what they're doing
      //so if there's a subscript, superscript, or fraction before, we stay in the exponent
      //still behaves as it does for y=x^2+2 or y=2^x+3. But now it's easier to write
      //e^-x^2+4 or y=e^(b*x1+c)
      && !this.prev.firstChild
    ) this.moveRight();

    //Hack #2.5 by Eli: break out of the end of subscripts. Be a little more aggressive about breaking out down there
    if (
      "+=-<>~*".indexOf(ch) >= 0 && this.parent.parent.ctrlSeq === '_'
      && !this.next && this.prev
    ) this.moveRight();

    //Hack #3 by Eli: if you type "^" just after a superscript, behave as though you just pressed up
    if (ch === '^' && this.prev instanceof SupSub && 
      //note: need both of these, because if it's a superscript and subscript,
      //those could appear in either order
      (this.prev.ctrlSeq === '^' || this.prev.prev.ctrlSeq === '^')) {
      this.moveUp();
      return;
    }

    //Hack #3.5 by Eli: if you type "_" just after a subscript, return early
    if (ch === '_' && this.prev instanceof SupSub && 
      //note: need both of these, because if it's a superscript and subscript,
      //those could appear in either order
      (this.prev.ctrlSeq === '_' || this.prev.prev.ctrlSeq === '_')) {
      return;
    }


    //Hack #4 by Eli: if you type "^" just _before_ a superscript, behave as though you just pressed up
    if (ch === '^' && this.next instanceof SupSub && 
      //note: need both of these, because if it's a superscript and subscript,
      //those could appear in either order
      (this.next.ctrlSeq === '^' || (this.next.next && this.next.next.ctrlSeq === '^'))) {
      this.moveUp();
      return;
    }

    //Hack #5 by Eli: typing a number after a variable subscripts it
    if (
      !this.selection &&
      !(this.next && this.next instanceof SupSub) &&
      '0123456789'.indexOf(ch) >= 0 &&
      (
        (this.prev && this.prev.htmlTemplate.substr(0, 5) === '<var>') ||
        (this.prev instanceof SupSub && this.prev.ctrlSeq === '_' && this.prev.prev.ctrlSeq !== '^')
      )
    ) {
      if (this.prev instanceof SupSub) {
        this.moveDown();
      } else {
        this.insertNew(LatexCmds['_']('_'));
      }
      this.insertNew(VanillaSymbol(ch));
      this.moveUp();
      return;
    }

    //hack #6: don't allow nested subscripts
    if (ch === "_" && this.isInSubscript()) return;

    //hack #7: break out of subscripts for division & exponentiation
    if (ch === '/' || ch === '^') {
      while (this.isInSubscript()) this.moveRightWithin()
    }

    clearUpDownCache(this);
    this.show();

    var cmd;
    if (ch.match(/^[a-z]$/i))
      cmd = Variable(ch);
    else if (cmd = CharCmds[ch] || LatexCmds[ch])
      cmd = cmd(ch);
    else
      cmd = VanillaSymbol(ch);

    if (this.selection) {
      this.prev = this.selection.first.prev;
      this.next = this.selection.last.next;
      cmd.replaces(this.selection);
      delete this.selection;
    }

    return this.insertNew(cmd);
  };
  _.insertNew = function(cmd) {
    cmd.createBefore(this);
    return this;
  };
  _.insertCmd = function(latexCmd, replacedFragment) {
    clearUpDownCache(this);
    this.show();

    var cmd = LatexCmds[latexCmd];
    if (cmd) {
      cmd = cmd(latexCmd);
      if (replacedFragment) cmd.replaces(replacedFragment);
      this.insertNew(cmd);
    }
    else {
      cmd = TextBlock();
      cmd.replaces(latexCmd);
      cmd.firstChild.focus = function(){ delete this.focus; return this; };
      this.insertNew(cmd).insertAfter(cmd);
      if (replacedFragment)
        replacedFragment.remove();
    }
    return this;
  };
  _.unwrapGramp = function() {
    var gramp = this.parent.parent;
    var greatgramp = gramp.parent;
    var next = gramp.next;
    var cursor = this;

    var prev = gramp.prev;
    gramp.disown().eachChild(function(uncle) {
      if (uncle.isEmpty()) return;

      uncle.children()
        .adopt(greatgramp, prev, next)
        .each(function(cousin) {
          cousin.jQ.insertBefore(gramp.jQ.first());
        })
      ;

      prev = uncle.lastChild;
    });

    if (!this.next) { //then find something to be next to insertBefore
      if (this.prev)
        this.next = this.prev.next;
      else {
        while (!this.next) {
          this.parent = this.parent.next;
          if (this.parent)
            this.next = this.parent.firstChild;
          else {
            this.next = gramp.next;
            this.parent = greatgramp;
            break;
          }
        }
      }
    }
    if (this.next)
      this.insertBefore(this.next);
    else
      this.appendTo(greatgramp);

    gramp.jQ.remove();

    if (gramp.prev)
      gramp.prev.respace();
    if (gramp.next)
      gramp.next.respace();
  };
  _.backspace = function() {
    clearUpDownCache(this);
    this.show();

    if (this.deleteSelection()); // pass
    else if (this.prev) {
      if (this.prev.isEmpty()) {
        if (this.prev.ctrlSeq === '\\le ') var ins = LatexCmds['<']('<');
        else if (this.prev.ctrlSeq === '\\ge ') var ins = LatexCmds['>']('>');
        this.prev = this.prev.remove().prev;
        if (ins) this.insertNew(ins);
      }
      else if (this.prev instanceof Bracket) {
        return this.appendTo(this.prev.firstChild).deleteForward();
      }
      else if (this.prev instanceof SupSub && this.prev.ctrlSeq === '_' && this.prev.prev.ctrlSeq !== '^') {
        this.moveDown()
        this.backspace()
        //extra hack to clear out subscript altogether when it's empty (takes two backspaces)
        if (!this.prev && !this.next) {
          this.backspace()
        } else {
          this.moveUp()
        }
      } else {
        this.selectLeft();
      }
    }
    else if (this.parent !== this.root) {
      if (this.parent.parent.isEmpty())
        return this.insertAfter(this.parent.parent).backspace();
      else if (this.next instanceof Bracket)
        return this.prependTo(this.next.firstChild).backspace();
      else
        this.unwrapGramp();
    }
    else this.root.triggerSpecialEvent('backspacePressed');

    if (this.prev)
      this.prev.respace();
    if (this.next)
      this.next.respace();
    this.parent.bubble('redraw');

    return this;
  };
  _.deleteForward = function() {
    clearUpDownCache(this);
    this.show();

    if (this.deleteSelection()); // pass
    else if (this.next) {
      if (this.next.isEmpty())
        this.next = this.next.remove().next;
      else
        this.selectRight();
    }
    else if (this.parent !== this.root) {
      if (this.parent.parent.isEmpty())
        return this.insertBefore(this.parent.parent).deleteForward();
      else
        this.unwrapGramp();
    }
    else this.root.triggerSpecialEvent('delPressed');

    if (this.prev)
      this.prev.respace();
    if (this.next)
      this.next.respace();
    this.parent.bubble('redraw');

    return this;
  };
  _.selectFrom = function(anticursor) {
    //find ancestors of each with common parent
    var oneA = this, otherA = anticursor; //one ancestor, the other ancestor
    loopThroughAncestors: do {
      for (var oneI = this; oneI !== oneA.parent.parent; oneI = oneI.parent.parent) //one intermediate, the other intermediate
        if (oneI.parent === otherA.parent) {
          left = oneI;
          right = otherA;
          break loopThroughAncestors;
        }

      for (var otherI = anticursor; otherI !== otherA.parent.parent; otherI = otherI.parent.parent)
        if (oneA.parent === otherI.parent) {
          left = oneA;
          right = otherI;
          break loopThroughAncestors;
        }

      if (oneA.parent.parent)
        oneA = oneA.parent.parent;
      if (otherA.parent.parent)
        otherA = otherA.parent.parent;
    } while (oneA.parent.parent || otherA.parent.parent || oneA.parent === otherA.parent);
    // the only way for this condition to fail is if A and B are in separate
    // trees, which should be impossible, but infinite loops must never happen,
    // even under error conditions.
    pray('cursor and anticursor are in the same tree',
         oneA.parent.parent || otherA.parent.parent || oneA.parent === otherA.parent);

    //figure out which is left/prev and which is right/next
    var left, right, leftRight;
    if (left.next !== right) {
      for (var next = left; next; next = next.next) {
        if (next === right.prev) {
          leftRight = true;
          break;
        }
      }
      if (!leftRight) {
        leftRight = right;
        right = left;
        left = leftRight;
      }
    }
    this.hide().selection = Selection(left.prev.next || left.parent.firstChild, right.next.prev || right.parent.lastChild);
    this.insertAfter(right.next.prev || right.parent.lastChild);
    this.root.selectionChanged();
  };
  _.selectLeft = function() {
    clearUpDownCache(this);
    if (this.selection) {
      if (this.selection.first === this.next) { //if cursor is at left edge of selection;
        if (this.prev) //then extend left if possible
          this.hopLeft().selection.extendLeft();
        else if (this.parent !== this.root) //else level up if possible
          this.insertBefore(this.parent.parent).selection.levelUp();
      }
      else { //else cursor is at right edge of selection, retract left if possible
        this.hopLeft();
        if (this.selection.first === this.selection.last) {
          this.clearSelection().show(); //clear selection if retracting to nothing
          return; //skip this.root.selectionChanged(), this.clearSelection() does it anyway
        }
        this.selection.retractLeft();
      }
    }
    else {
      if (this.prev)
        this.hopLeft();
      else //end of a block
        if (this.parent !== this.root)
          this.insertBefore(this.parent.parent);
        else
          return;

      this.hide().selection = Selection(this.next);
    }
    this.root.selectionChanged();
  };
  _.selectRight = function() {
    clearUpDownCache(this);
    if (this.selection) {
      if (this.selection.last === this.prev) { //if cursor is at right edge of selection;
        if (this.next) //then extend right if possible
          this.hopRight().selection.extendRight();
        else if (this.parent !== this.root) //else level up if possible
          this.insertAfter(this.parent.parent).selection.levelUp();
      }
      else { //else cursor is at left edge of selection, retract right if possible
        this.hopRight();
        if (this.selection.first === this.selection.last) {
          this.clearSelection().show(); //clear selection if retracting to nothing
          return; //skip this.root.selectionChanged(), this.clearSelection() does it anyway
        }
        this.selection.retractRight();
      }
    }
    else {
      if (this.next)
        this.hopRight();
      else //end of a block
        if (this.parent !== this.root)
          this.insertAfter(this.parent.parent);
        else
          return;

      this.hide().selection = Selection(this.prev);
    }
    this.root.selectionChanged();
  };

  function clearUpDownCache(self) {
    self.upDownCache = {};
  }

  _.prepareMove = function() {
    clearUpDownCache(this);
    return this.show().clearSelection();
  };

  _.prepareEdit = function() {
    clearUpDownCache(this);
    return this.show().deleteSelection();
  }

  _.clearSelection = function() {
    if (this.selection) {
      this.selection.clear();
      delete this.selection;
      this.root.selectionChanged();
    }
    return this;
  };
  _.deleteSelection = function() {
    if (!this.selection) return false;

    this.prev = this.selection.first.prev;
    this.next = this.selection.last.next;
    this.selection.remove();
    this.root.selectionChanged();
    return delete this.selection;
  };
});

var Selection = P(MathFragment, function(_, _super) {
  _.init = function() {
    var frag = this;
    _super.init.apply(frag, arguments);

    frag.jQwrap(frag.jQ);
  };
  _.jQwrap = function(children) {
    this.jQ = children.wrapAll('<span class="mq-selection"></span>').parent();
      //can't do wrapAll(this.jQ = $(...)) because wrapAll will clone it
  };
  _.adopt = function() {
    this.jQ.replaceWith(this.jQ = this.jQ.children());
    return _super.adopt.apply(this, arguments);
  };
  _.clear = function() {
    this.jQ.replaceWith(this.jQ.children());
    return this;
  };
  _.levelUp = function() {
    var seln = this,
      gramp = seln.first = seln.last = seln.last.parent.parent;
    seln.clear().jQwrap(gramp.jQ);
    return seln;
  };
  _.extendLeft = function() {
    this.first = this.first.prev;
    this.first.jQ.prependTo(this.jQ);
  };
  _.extendRight = function() {
    this.last = this.last.next;
    this.last.jQ.appendTo(this.jQ);
  };
  _.retractRight = function() {
    this.first.jQ.insertBefore(this.jQ);
    this.first = this.first.next;
  };
  _.retractLeft = function() {
    this.last.jQ.insertAfter(this.jQ);
    this.last = this.last.prev;
  };
});
