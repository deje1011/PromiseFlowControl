this.exampleHandlers = [
    {
        pattern: /^resolves in (.*)$/,
        template: 'autodoc-promise-resolve',
        data: function(match) {
            return { expectedResult : match[1] };
        }
    },
    {
        pattern: /^rejects with (.*)$/,
        template: 'autodoc-promise-reject',
        data: function(match) {
            return { expectedError : match[1] };
        }
    }
];