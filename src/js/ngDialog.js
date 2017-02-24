/*
 * angular-dialog
 * 基于angular的dialog组件
 * https://github.com/cnlf/angular-dialog
 */

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        // CommonJS
        if (typeof angular === 'undefined') {
            factory(require('angular'));
        } else {
            factory(angular);
        }
        module.exports = 'ngDialog';
    } else if (typeof define === 'function' && define.amd) {
        // AMD
        define(['angular'], factory);
    } else {
        // Global Variables
        factory(root.angular);
    }
}(this, function (angular) {
    'use strict';

    var module = angular.module('ngDialog', []),
        $el = angular.element,
        animationEndEvent = 'animationend webkitAnimationEnd mozAnimationEnd MSAnimationEnd oanimationend',
        disabledAnimationClass = 'ngdialog-disabled-animation',
        errorTemplate = {
            empty: '<h1>模板不能为空！</h1>',
            only: '<h1>template和templateUrl只能配置一项！</h1>'
        },
        keyCode = {
            esc: 27
        },
        isBindKeydown = false,
        defaults = {
            disableAnimation: false,
            showClose: true,
            closeByDocument: true,
            closeByEsc: true,
            closeByRouter: true,
            preCloseCallback: false,
            overlay: true,
            className: 'ngdialog-theme-default',
            bodyClassName: 'ngdialog-open',
            width: null,
            height: null
        };

    module.provider('ngDialog', function () {
        this.defaults = defaults;
        this.setDefaults = function (newDefaults) {
            angular.extend(defaults, newDefaults);
        };

        var defaultID = 0,
            dialogsCount = 0,
            defers = {},
            scopes = {},
            openIdStack = [];

        this.$get = [
            '$rootScope', '$document', '$templateCache', '$compile', '$q', '$http', '$timeout', '$window', '$controller', '$injector',
            function ($rootScope, $document, $templateCache, $compile, $q, $http, $timeout, $window, $controller, $injector) {
                var $body = $document.find('body');
                var $html = $document.find('html');
                var privateMethods = {
                    getViewportSize: function () {
                        var result = {};

                        if (window.innerWidth) {
                            result.winW = window.innerWidth;
                            result.winH = window.innerHeight
                        } else {
                            if (document.documentElement.offsetWidth === document.documentElement.clientWidth) {
                                result.winW = document.documentElement.offsetWidth;
                                result.winH = document.documentElement.offsetHeight
                            } else {
                                result.winW = document.documentElement.clientWidth;
                                result.winH = document.documentElement.clientHeight;
                            }
                        }

                        result.docW = Math.max(
                            document.documentElement.scrollWidth,
                            document.body.scrollWidth,
                            document.documentElement.offsetWidth
                        );
                        result.docH = Math.max(
                            document.documentElement.scrollHeight,
                            document.body.scrollHeight,
                            document.documentElement.offsetHeight
                        );

                        return result;
                    },

                    contentMiddle: function ($dialog) {
                        var dialogContent = $dialog[0].querySelector('.ngdialog-content');
                        var computedStyle = privateMethods.getComputedStyle(dialogContent);
                        var viewSize = privateMethods.getViewportSize();

                        $el(dialogContent).css({
                            position: 'absolute',
                            left: (viewSize.winW - parseInt(computedStyle.width, 10)) / 2 + 'px',
                            top: (viewSize.winH - parseInt(computedStyle.height, 10)) / 2 + 'px'
                        })
                    },

                    keydownHandler: function (event) {
                        if (event.keyCode === keyCode.esc) {
                            exports.close('$escape');
                        }
                    },

                    performCloseDialog: function ($dialog, value) {
                        var options = $dialog.data('$ngDialogOptions');
                        var id = $dialog.attr('id');
                        var scope = scopes[id];


                        if (!scope) {
                            return;
                        }

                        if (typeof $window.Hammer !== 'undefined') {
                            var hammerTime = scope.hammerTime;
                            hammerTime.off('tap', function (event) {
                                privateMethods.closeDocumentHandler.call($dialog, event);
                            });
                            hammerTime.destroy && hammerTime.destroy();
                            delete scope.hammerTime;
                        } else {
                            $dialog.unbind('click');
                        }

                        if (dialogsCount === 1) {
                            $body.unbind('keydown', privateMethods.keydownHandler);
                        }

                        if (!$dialog.hasClass('ngdialog-closing')) {
                            dialogsCount -= 1;
                        }

                        $rootScope.$broadcast('ngDialog.closing', $dialog, value);
                        dialogsCount = dialogsCount < 0 ? 0 : dialogsCount;

                        if (!options.disableAnimation) {
                            scope.$destroy();
                            $dialog.unbind(animationEndEvent).bind(animationEndEvent, function () {
                                privateMethods.closeDialogElement($dialog, value);
                            }).addClass('ngdialog-closing');
                        }
                        else {
                            scope.$destroy();
                            privateMethods.closeDialogElement($dialog, value);
                        }

                        if (defers[id]) {
                            defers[id].resolve({
                                id: id,
                                value: value,
                                $dialog: $dialog,
                                remainingDialogs: dialogsCount
                            });
                            delete defers[id];
                        }

                        if (scopes[id]) {
                            delete scopes[id];
                        }

                        openIdStack.splice(openIdStack.indexOf(id), 1);
                        if (!openIdStack.length) {
                            $body.unbind('keydown', privateMethods.keydownHandler);
                            isBindKeydown = false;
                        }
                    },

                    getComputedStyle: function (ele) {
                        if (window.getComputedStyle) {
                            return window.getComputedStyle(ele, null);
                        } else {
                            return ele.currentStyle;
                        }
                    },

                    closeDialogElement: function ($dialog, value) {
                        var options = $dialog.data('$ngDialogOptions');
                        $dialog.remove();
                        if (dialogsCount === 0) {
                            $html.removeClass(options.bodyClassName);
                            $body.removeClass(options.bodyClassName);
                        }
                        $rootScope.$broadcast('ngDialog.closed', $dialog, value);
                    },

                    closeDialog: function ($dialog, value) {
                        var options = $dialog.data('$ngDialogOptions');
                        var preCloseCallback = options.preCloseCallback;

                        if (preCloseCallback && angular.isFunction(preCloseCallback)) {
                            var preCloseCallbackResult = preCloseCallback.call($dialog, value);

                            if (angular.isObject(preCloseCallbackResult)) {
                                if (preCloseCallbackResult.closePromise) {
                                    preCloseCallbackResult.closePromise.then(function () {
                                        privateMethods.performCloseDialog($dialog, value);
                                    }, function () {
                                        return false;
                                    });
                                } else {
                                    preCloseCallbackResult.then(function () {
                                        privateMethods.performCloseDialog($dialog, value);
                                    }, function () {
                                        return false;
                                    });
                                }
                            } else if (preCloseCallbackResult !== false) {
                                privateMethods.performCloseDialog($dialog, value);
                            } else {
                                return false;
                            }
                        } else {
                            privateMethods.performCloseDialog($dialog, value);
                        }
                    },

                    detectUIRouter: function () {
                        try {
                            angular.module('ui.router');
                            return true;
                        } catch (err) {
                            return false;
                        }
                    },

                    getRouterLocationEventName: function () {
                        if (privateMethods.detectUIRouter()) {
                            return '$stateChangeStart';
                        }
                        return '$locationChangeStart';
                    },

                    closeDocumentHandler: function (event) {
                        var options = this.data('$ngDialogOptions');
                        var isOverlay = options.closeByDocument ? $el(event.target).hasClass('ngdialog-overlay') : false;
                        var isCloseBtn = $el(event.target).hasClass('ngdialog-close');

                        if (isOverlay || isCloseBtn) {
                            exports.close(this.attr('id'), isCloseBtn ? '$closeButton' : '$document');
                        }
                    },

                    getTemplateByUrl: function (tpl, config) {
                        config.headers = config.headers || {};

                        angular.extend(config.headers, {'Accept': 'text/html'});
                        $rootScope.$broadcast('ngDialog.templateLoading', tpl);

                        return $http.get(tpl, config).then(function (res) {
                            $rootScope.$broadcast('ngDialog.templateLoaded', tpl);
                            return res.data || '';
                        });
                    },

                    getTemplate: function (tpl, type) {
                        if (type === 'interior' && angular.isString(tpl)) {
                            if (tpl.trim()[0] === '<') {
                                return tpl;
                            }
                            else {
                                return this.getTemplateByUrl(tpl, {cache: $templateCache});
                            }
                        }
                        else {
                            return this.getTemplateByUrl(tpl, {cache: false});
                        }
                    },

                    setDialogSize: function (property) {
                        var options = this.data('$ngDialogOptions');
                        var $dialogContent = this[0].querySelector('.ngdialog-content');

                        if (property && angular.isNumber(options[property])) {
                            $dialogContent.style[property] = options[property] + 'px';
                        }
                        else {
                            $dialogContent.style[property] = options[property];
                        }
                    }
                };
                var exports = {
                    open: function (opts) {
                        var defer, scope, resolve, template, templateType, $dialog, $dialogContent;
                        var options = angular.copy(defaults);
                        var dialogID = 'ngdialog' + ++defaultID;

                        openIdStack.push(dialogID);
                        opts = opts || {};

                        if (options.data && angular.isObject(options.data)) {
                            if (typeof opts.data === 'undefined') {
                                opts.data = {};
                            }
                            opts.data = angular.merge(angular.copy(options.data), opts.data);
                        }

                        angular.extend(options, opts);

                        defers[dialogID] = defer = $q.defer();
                        scopes[dialogID] = scope = angular.isObject(options.scope) ? options.scope.$new() : $rootScope.$new();


                        resolve = angular.extend({}, options.resolve);
                        angular.forEach(resolve, function (value, key) {
                            resolve[key] = angular.isString(value) ?
                                $injector.get(value) :
                                $injector.invoke(value, null, null, key);
                        });

                        if (!options.template && !options.templateUrl) {
                            options.template = errorTemplate.empty;
                            options.templateUrl = '';
                        }
                        if (options.template && options.templateUrl) {
                            options.template = errorTemplate.only;
                            options.templateUrl = '';
                        }

                        templateType = options.template && !options.templateUrl ? 'interior' : 'exterior';
                        template = options.template || options.templateUrl;

                        $q.all({
                            template: privateMethods.getTemplate(template, templateType),
                            locals: $q.all(resolve)
                        }).then(function (data) {
                            var template = data.template;
                            var templateWrap = '';
                            var locals = data.locals;

                            if (options.showClose) {
                                template += '<div class="ngdialog-close"></div>';
                            }

                            if (options.overlay) {
                                templateWrap += '<div class="ngdialog-overlay"></div>';
                            }

                            $dialog = $el('<div id="' + dialogID + '" class="ngdialog"></div>');
                            $dialog.html(templateWrap + '<div class="ngdialog-content">' + template + '</div>');
                            $dialog.data('$ngDialogOptions', options);

                            scope.ngDialogId = dialogID;
                            if (options.data && angular.isObject(options.data)) {
                                scope.ngDialogData = options.data;
                                scope.ngDialogData.ngDialogId = dialogID;
                            }

                            scope.closeDialog = function (value) {
                                privateMethods.closeDialog($dialog, value);
                            };

                            if (options.className) {
                                $dialog.addClass(options.className);
                            }

                            if (options.disableAnimation) {
                                $dialog.addClass(disabledAnimationClass);
                            }

                            if (options.width) {
                                privateMethods.setDialogSize.call($dialog, 'width');
                            }

                            if (options.height) {
                                privateMethods.setDialogSize.call($dialog, 'height');
                            }

                            if (
                                options.controller &&
                                (
                                    angular.isString(options.controller) ||
                                    angular.isArray(options.controller) ||
                                    angular.isFunction(options.controller)
                                )
                            ) {
                                var opts = angular.extend(
                                    locals,
                                    {
                                        $scope: scope,
                                        $element: $dialog
                                    }
                                );
                                $controller(options.controller, opts, true)();
                            }

                            if (!isBindKeydown) {
                                $body.bind('keydown', privateMethods.keydownHandler);
                                isBindKeydown = !isBindKeydown;
                            }

                            if (options.closeByRouter) {
                                var eventName = privateMethods.getRouterLocationEventName();
                                $rootScope.$on(eventName, function ($event) {
                                    if (privateMethods.closeDialog($dialog) === false) {
                                        $event.preventDefault();
                                    }
                                });
                            }

                            $dialog.bind('click', function (event) {
                                privateMethods.closeDocumentHandler.call($dialog, event)
                            });

                            dialogsCount += 1;

                            $timeout(function () {
                                $compile($dialog)(scope);
                                $html.addClass(options.bodyClassName);
                                $body.addClass(options.bodyClassName);
                                $body.append($dialog);
                                privateMethods.contentMiddle($dialog);
                                $rootScope.$broadcast('ngDialog.opened', $dialog);
                            });
                        });

                        return {
                            id: dialogID,
                            closePromise: defer.promise,
                            close: function (value) {
                                privateMethods.closeDialog($dialog, value);
                            }
                        };
                    },

                    openConfirm: function (opts) {
                        var $openedDialog;
                        var defer = $q.defer();
                        var options = angular.copy(defaults);

                        opts = opts || {};
                        if (options.data && angular.isObject(options.data)) {
                            if (typeof opts.data === 'undefined') {
                                opts.data = {};
                            }
                            opts.data = angular.merge(angular.copy(options.data), opts.data);
                        }

                        angular.extend(options, opts);

                        options.scope = $rootScope.$new();
                        options.scope.confirm = function (value) {
                            defer.resolve(value);
                            var $dialog = $el(document.getElementById($openedDialog.id));
                            privateMethods.performCloseDialog($dialog, value);
                        };

                        $openedDialog = exports.open(options);
                        if ($openedDialog) {
                            $openedDialog.closePromise.then(function (data) {
                                if (data) {
                                    return defer.reject(data.value);
                                }
                                return defer.reject();
                            });
                            return defer.promise;
                        }
                    },

                    isOpen: function (id) {
                        var $dialog = $el(document.getElementById(id));
                        return $dialog.length > 0;
                    },

                    close: function (id, value) {
                        var $dialog = $el(document.getElementById(id));

                        if ($dialog.length) {
                            privateMethods.closeDialog($dialog, value);
                        } else {
                            if (id === '$escape') {
                                var topDialogId = openIdStack[openIdStack.length - 1];
                                $dialog = $el(document.getElementById(topDialogId));
                                if ($dialog.data('$ngDialogOptions').closeByEsc) {
                                    privateMethods.closeDialog($dialog, '$escape');
                                }
                            } else {
                                exports.closeAll(value);
                            }
                        }

                        return exports;
                    },

                    closeAll: function (value) {
                        var $all = document.querySelectorAll('.ngdialog');

                        for (var i = $all.length - 1; i >= 0; i--) {
                            var dialog = $all[i];
                            privateMethods.closeDialog($el(dialog), value);
                        }
                    },

                    getOpenDialogs: function () {
                        return openIdStack;
                    }
                };

                return exports;
            }];
    });

    module.directive('ngDialog', ['ngDialog', function (ngDialog) {
        return {
            restrict: 'A',
            scope: {
                ngDialogScope: '='
            },
            link: function (scope, elem, attrs) {
                elem.on('click', function (e) {
                    e.preventDefault();
                    ngDialog.open({
                        template: attrs.ngDialog,
                        className: attrs.ngDialogClass || defaults.className,
                        controller: attrs.ngDialogController,
                        disableAnimation: attrs.ngDialogDisableAnimation !== 'false',
                        data: attrs.ngDialogData,
                        showClose: attrs.ngDialogShowClose === 'false' ? false : (attrs.ngDialogShowClose === 'true' ? true : defaults.showClose),
                        closeByDocument: attrs.ngDialogCloseByDocument === 'false' ? false : (attrs.ngDialogCloseByDocument === 'true' ? true : defaults.closeByDocument),
                        closeByEsc: attrs.ngDialogCloseByEsc === 'false' ? false : (attrs.ngDialogCloseByEsc === 'true' ? true : defaults.closeByEsc),
                        overlay: attrs.ngDialogOverlay === 'false' ? false : (attrs.ngDialogOverlay === 'true' ? true : defaults.overlay),
                        preCloseCallback: attrs.ngDialogPreCloseCallback || defaults.preCloseCallback,
                        bodyClassName: attrs.ngDialogBodyClass || defaults.bodyClassName
                    });
                });
            }
        };
    }]);
}));
