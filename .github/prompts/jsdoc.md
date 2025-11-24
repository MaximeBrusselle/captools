# JSDoc Implementation Prompt

## Overview

This prompt provides detailed instructions for implementing comprehensive JSDoc documentation in JavaScript applications. The goal is to ensure all functions, methods, classes, interfaces, and complex code blocks are properly documented with standardized JSDoc comments.

## JSDoc Standards

- **Standard**: Follow official JSDoc specification
- **Style**: Consistent formatting and structure
- **Coverage**: All public and private members
- **Quality**: Clear, concise, and informative descriptions

## Step-by-Step Process

### 1. Code Analysis and Documentation Requirements

#### Class Documentation

- **Location**: All JavaScript class files
- **Document**: ALL classes including but not limited to:
  - Class declaration: `export default class Main extends BaseController {`
  - Class purpose and responsibility
  - Constructor parameters and behavior
  - Class-level properties and their purposes
  - Inheritance relationships
  - Usage examples for complex classes
  - Abstract classes and their implementation requirements
  - Static classes and utility classes
  - Singleton patterns and their usage
  - Event emitter classes and their events
  - Factory classes and their creation methods

#### Method and Function Documentation

- **Location**: All JavaScript files with functions/methods
- **Document**: ALL functions and methods including but not limited to:
  - Public methods: `async onSubmitRegistrationButtonPress() {`
  - Private methods: `async _persistChanges() {`
  - Static methods: `static createInstance() {`
  - Async methods: `async fetchData() {`
  - Event handlers: `onButtonPress(event) {`
  - Lifecycle methods: `onInit() {`
  - Getter/setter methods: `get userName() {`
  - Arrow functions: `const processData = (data) => { }`
  - Callback functions: `array.map((item) => { })`
  - Higher-order functions
  - Factory functions
  - Utility functions
  - Validation functions
  - Transformation functions
  - API integration functions

**Documentation Requirements:**

- **ALWAYS** specify method visibility (`@public` or `@private`)
- **ALWAYS** include parameter descriptions using `@param paramName - Description`
- **ALWAYS** include return value descriptions using `@returns Description`
- **ALWAYS** document thrown exceptions using `@throws Description`

#### Object and Structure Documentation

- **Location**: All JavaScript object definitions and data structures
- **Document**: ALL objects and structures including but not limited to:
  - Object literals: `const config = {`
  - Constructor functions: `function User(name, email) {`
  - Prototype methods: `User.prototype.getName = function() {`
  - Module exports: `module.exports = {`
  - Namespace objects: `const Utils = {`
  - Configuration objects
  - Data structures
  - API response objects
  - Event objects
  - Error objects

### 2. JSDoc Tag Structure

#### Essential Tags

Use appropriate JSDoc tags for comprehensive documentation:
