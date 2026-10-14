import React from 'react';
import './AIOperationsAnalyst.css';
import MultiAgentConsole from './MultiAgentConsole';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, info: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, info) {
        console.error("ErrorBoundary caught an error", error, info);
        this.setState({ info });
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '20px', background: 'red', color: 'white', overflow: 'auto' }}>
                    <h2>Something went wrong in AIOperationsAnalyst.</h2>
                    <pre>{this.state.error && this.state.error.toString()}</pre>
                    <pre>{this.state.info && this.state.info.componentStack}</pre>
                </div>
            );
        }
        return this.props.children;
    }
}

const AIOperationsAnalystInner = ({ surgeries, cptCodes, _settings, patients, onSchedule }) => {
    const safeSurgeries = Array.isArray(surgeries) ? surgeries : [];
    const safeCptCodes = Array.isArray(cptCodes) ? cptCodes : [];
    const safePatients = Array.isArray(patients) ? patients : [];

    return (
        <MultiAgentConsole surgeries={safeSurgeries} cptCodes={safeCptCodes} patients={safePatients} onSchedule={onSchedule} />
    );
};

const AIOperationsAnalyst = (props) => (
    <ErrorBoundary>
        <AIOperationsAnalystInner {...props} />
    </ErrorBoundary>
);

export default AIOperationsAnalyst;
